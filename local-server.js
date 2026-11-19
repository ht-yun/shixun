/* CloudLab 本地开发服务：零外部依赖，供本地开发与前端联调使用。 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const terminalGateway = require('./terminal-gateway');
const gitRepositories = require('./git-repository-service');

const root = __dirname;
const dataFile = path.resolve(process.env.CLOUDLAB_DATA_FILE || path.join(root, 'local-data.json'));
const authFile = path.resolve(process.env.CLOUDLAB_AUTH_FILE || path.join(path.dirname(dataFile), 'cloudlab-auth.json'));
const uploadsDir = path.resolve(process.env.CLOUDLAB_UPLOADS_DIR || path.join(path.dirname(dataFile), 'uploads'));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const authRequired = process.env.CLOUDLAB_AUTH_REQUIRED === 'true';
const secureCookies = process.env.CLOUDLAB_COOKIE_SECURE === 'true';
const sessionLifetimeSeconds = Math.max(3600, Number(process.env.CLOUDLAB_SESSION_SECONDS || 7 * 24 * 60 * 60));
const bootstrapMaxBytes = Math.max(1_000_000, Number(process.env.CLOUDLAB_BOOTSTRAP_MAX_BYTES || 32 * 1024 * 1024));
const failedLogins = new Map();
const evaluationReceipts = new Map();
const loginWindowMs = 15 * 60 * 1000;
const maxLoginFailures = 5;
const initialData = {
  version: 2,
  revision: 0,
  courses: [],
  labs: [],
  questionBank: [],
  labComments: [],
  settings: { teacherName: '', institution: '', terminalMaxSessions: 10, terminalMaxSessionsPerIp: 0 },
  studentProgress: { status: '未开始', score: null, attempts: 0, completedAt: '', lastActivityAt: '', history: [], gradeRecords: [], resourceProgress: {} }
};
function progressForActor(data, actor) {
  if (!authRequired || actor?.role !== 'student') return data.studentProgress;
  data.studentProgressByAccount ||= {};
  return data.studentProgressByAccount[actor.id] ||= structuredClone(initialData.studentProgress);
}

function recordVerifiedLabEvaluation(data, actor, result = {}) {
  const now = result.now || new Date().toISOString();
  const evaluationId = String(result.evaluationId || crypto.randomUUID()).slice(0, 128);
  const studentNameSnapshot = String(actor?.name || result.studentNameSnapshot || '未知学生').trim().slice(0, 80);
  const labId = String(result.labId || '').slice(0, 128);
  const checkpointId = String(result.checkpointId || '').slice(0, 128);
  const courseId = String(result.courseId || '').slice(0, 128);
  const examId = String(result.examId || '').slice(0, 128);
  const passed = result.passed === true;
  const submittedScore = Number(result.score);
  const score = Number.isFinite(submittedScore) ? Math.max(0, Math.min(100, Math.round(submittedScore))) : (passed ? 100 : 0);
  const lab = data.labs.find(item => item.id === labId);
  const checkpointIds = Array.isArray(lab?.checkpoints) && lab.checkpoints.length ? lab.checkpoints.map(item => item.id) : ['checkpoint-legacy'];
  const effectiveCheckpoint = checkpointId || checkpointIds[0];
  const course = data.courses.find(item => item.id === courseId);
  const exam = course?.exams?.find(item => item.id === examId && item.status === '已发布' && examLinksLab(item, labId, effectiveCheckpoint));
  const gradeType = exam ? 'exam' : 'regular';
  const maxScore = exam ? Math.max(1, Number(exam.totalScore || 100)) : 100;
  const gradeScore = exam ? Math.round(score / 100 * maxScore) : score;
  const progress = progressForActor(data, actor);
  progress.resourceProgress ||= {};
  progress.history = Array.isArray(progress.history) ? progress.history : [];
  progress.gradeRecords = Array.isArray(progress.gradeRecords) ? progress.gradeRecords : [];
  progress.lastActivityAt = now;
  if (progress.status === '未开始') progress.status = '进行中';
  progress.attempts = Number(progress.attempts || 0) + 1;
  progress.score = Math.max(Number(progress.score ?? 0), score);

  progress.gradeRecords.unshift({
    id: evaluationId,
    studentAccountId: String(actor?.id || 'student-current').slice(0, 128),
    studentNameSnapshot,
    gradeType,
    courseId,
    labId,
    checkpointId: effectiveCheckpoint,
    examId: exam?.id || '',
    score: gradeScore,
    rawScore: score,
    maxScore,
    passed,
    at: now,
  });
  progress.gradeRecords = progress.gradeRecords.slice(0, 500);

  if (labId) {
    const checkpointKey = `lab:${labId}:${effectiveCheckpoint}`;
    const previousCheckpoint = progress.resourceProgress[checkpointKey] || {};
    progress.resourceProgress[checkpointKey] = {
      ...previousCheckpoint,
      courseId,
      labId,
      checkpointId: effectiveCheckpoint,
      examId: exam?.id || '',
      gradeType,
      evaluationId,
      resourceId: checkpointKey,
      status: passed ? '已完成' : '学习中',
      score: Math.max(Number(previousCheckpoint.score ?? 0), score),
      completedSubtasks: passed ? 1 : 0,
      totalSubtasks: 1,
      lastActivityAt: now,
      completedAt: passed ? (previousCheckpoint.completedAt || now) : (previousCheckpoint.completedAt || ''),
    };
    const completed = checkpointIds.filter(id => progress.resourceProgress[`lab:${labId}:${id}`]?.status === '已完成').length;
    const labKey = `lab:${labId}`;
    const previousLab = progress.resourceProgress[labKey] || {};
    progress.resourceProgress[labKey] = {
      ...previousLab,
      courseId,
      labId,
      examId: exam?.id || '',
      gradeType,
      evaluationId,
      resourceId: labKey,
      status: completed === checkpointIds.length ? '已完成' : '学习中',
      score: Math.max(Number(previousLab.score ?? 0), score),
      completedSubtasks: completed,
      totalSubtasks: checkpointIds.length,
      lastActivityAt: now,
      completedAt: completed === checkpointIds.length ? (previousLab.completedAt || now) : (previousLab.completedAt || ''),
    };
    if (completed === checkpointIds.length) {
      progress.status = '已完成';
      progress.completedAt ||= now;
    }
  } else if (passed) {
    progress.status = '已完成';
    progress.completedAt ||= now;
  }

  if (course && exam) {
      course.submissions = Array.isArray(course.submissions) ? course.submissions : [];
      const studentId = String(actor?.id || 'student-current');
      const existing = course.submissions.find(item => item.activityId === exam.id && item.studentId === studentId);
      const detail = String(result.detail || `${labId || '实验'}评测得分 ${score}`).slice(0, 500);
      const submission = {
        ...(existing || {}),
        id: existing?.id || crypto.randomUUID(),
        courseId,
        activityId: exam.id,
        kind: 'exam',
        gradeType: 'exam',
        evaluationId,
        studentId,
        studentName: String(actor?.name || '当前学生'),
        content: `实践项目自动评测：${detail}`,
        attachmentUrl: '',
        status: '已批阅',
        score: gradeScore,
        feedback: passed ? '实践项目自动评测通过' : '实践项目尚未达到通过标准',
        attemptCount: Number(existing?.attemptCount || 0) + 1,
        submittedAt: existing?.submittedAt || now,
        gradedAt: now,
        updatedAt: now,
        labId,
        checkpointId,
      };
      if (existing) course.submissions[course.submissions.indexOf(existing)] = submission;
      else course.submissions.unshift(submission);
  }

  progress.history.unshift({
    id: crypto.randomUUID(),
    kind: '评测',
    title: String(result.title || '提交正式评测').slice(0, 120),
    detail: String(result.detail || `${passed ? '达到' : '未达到'}通过标准，得分 ${score}`).slice(0, 500),
    evaluationId,
    studentNameSnapshot,
    gradeType,
    courseId,
    labId,
    checkpointId: effectiveCheckpoint,
    examId: exam?.id || '',
    score: gradeScore,
    maxScore,
    passed,
    resourceId: labId ? `lab:${labId}` : '',
    at: now,
  });
  progress.history = progress.history.slice(0, 100);
  return progress;
}
function studentCanAccessCourse(course, actor) {
  return actor?.role !== 'student' || (course?.members || []).some(member => member.accountId === actor.id);
}
function examLinksLab(exam, labId, checkpointId) {
  return (exam?.labReferences || []).some(reference => {
    const [linkedLab, linkedCheckpoint] = typeof reference === 'string' ? reference.split(':') : [reference.labId, reference.checkpointId];
    return linkedLab === labId && (!linkedCheckpoint || linkedCheckpoint === checkpointId);
  });
}
function studentCanAccessLab(data, labId, actor) {
  if (actor?.role !== 'student') return true;
  const linked = data.courses.filter(course => (course.stages || []).some(stage => stage.labId === labId) || (course.exams || []).some(exam => (exam.labReferences || []).some(ref => (typeof ref === 'string' ? ref : ref.labId) === labId)));
  return linked.length === 0 || linked.some(course => course.visibility !== '私有课程' || studentCanAccessCourse(course, actor));
}
function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    if (data.version !== initialData.version) throw new Error(`平台数据版本不兼容：${data.version}`);
    return {
      ...structuredClone(initialData),
      ...data,
      courses: Array.isArray(data.courses) ? data.courses : [],
      labs: Array.isArray(data.labs) ? data.labs.map(lab => ({ ...lab, mode: lab.mode === '网页桌面' ? '代码 + 命令行' : lab.mode })) : [],
      questionBank: Array.isArray(data.questionBank) ? data.questionBank : [],
      studentProgressByAccount: data.studentProgressByAccount && typeof data.studentProgressByAccount === 'object' ? data.studentProgressByAccount : {},
      labComments: Array.isArray(data.labComments) ? data.labComments : [],
      settings: {
        ...structuredClone(initialData.settings),
        ...(data.settings && typeof data.settings === 'object' ? data.settings : {}),
      },
      studentProgress: {
        ...structuredClone(initialData.studentProgress),
        ...(data.studentProgress && typeof data.studentProgress === 'object' ? data.studentProgress : {}),
        history: Array.isArray(data.studentProgress?.history) ? data.studentProgress.history : [],
        gradeRecords: Array.isArray(data.studentProgress?.gradeRecords) ? data.studentProgress.gradeRecords : [],
        resourceProgress: data.studentProgress?.resourceProgress && typeof data.studentProgress.resourceProgress === 'object' ? data.studentProgress.resourceProgress : {}
      }
    };
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(initialData);
    throw error;
  }
}
function saveData(data) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const temporary = `${dataFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temporary, dataFile);
}
function syncTerminalCapacity(data = loadData()) {
  return terminalGateway.configureCapacity({
    maxSessions: data.settings?.terminalMaxSessions,
    // 管理员只分配总容器数，不再按 IP 或项目切分容器配额。
    maxSessionsPerIp: 0,
  });
}
function resolveLabCheckpoint(lab = {}, checkpointId = '') {
  const checkpoints = Array.isArray(lab.checkpoints) ? lab.checkpoints : [];
  const checkpoint = checkpoints.find(item => item.id === checkpointId) || checkpoints[0];
  if (!checkpoint) return lab;
  const files = Array.isArray(lab.repository?.files) ? lab.repository.files : lab.initialFiles;
  return {
    ...lab,
    ...checkpoint,
    id: lab.id,
    projectName: lab.name,
    checkpointId: checkpoint.id,
    checkpointName: checkpoint.name,
    initialFiles: Array.isArray(files) ? files : [],
    evaluationConfig: checkpoint.evaluationConfig || lab.evaluationConfig,
  };
}
async function hydratedLabCheckpoint(lab = {}, checkpointId = '', requestedCommit = '') {
  const checkpoints = Array.isArray(lab.checkpoints) ? lab.checkpoints : [];
  const checkpoint = checkpoints.find(item => item.id === checkpointId) || checkpoints[0];
  if (lab.repository?.storage !== 'git') return resolveLabCheckpoint(lab, checkpointId);
  const pinnedCommit = /^[A-Fa-f0-9]{7,64}$/.test(String(requestedCommit || '')) ? String(requestedCommit) : '';
  const ref = pinnedCommit || checkpoint?.repositoryRef?.commitSha || lab.repository.headCommit || '';
  const snapshot = await gitRepositories.repositorySnapshot(lab.repository, ref);
  return resolveLabCheckpoint({ ...lab, initialFiles: snapshot.files, repository: { ...lab.repository, headCommit: snapshot.commitSha, files: snapshot.files } }, checkpointId);
}
async function hydratedData() {
  const data = loadData();
  data.labs = await Promise.all(data.labs.map(async lab => {
    try { return repositoryLabForClient(await gitRepositories.hydrateLabRepository(lab)); }
    catch (error) { return { ...lab, repositoryError: error.message || 'Git 仓库读取失败' }; }
  }));
  return data;
}
function repositoryForClient(repository = {}) {
  const { repoPath, cloneUrl, ...safe } = repository;
  return safe;
}
function repositoryLabForClient(lab = {}) {
  return { ...lab, repository: lab.repository ? repositoryForClient(lab.repository) : lab.repository };
}

function normalizedAnswer(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[，,\n]/);
  return list.map(item => String(item).trim().toLowerCase()).filter(Boolean).sort();
}

function gradeExamQuestions(exam = {}, questionBank = [], answers = {}) {
  let score = 0;
  let manualReview = false;
  const results = {};
  for (const reference of Array.isArray(exam.questionRefs) ? exam.questionRefs : []) {
    const question = questionBank.find(item => item.id === reference.questionId);
    if (!question) continue;
    const objective = !['简答题', '组合题'].includes(question.type);
    const expected = normalizedAnswer(question.answers || question.answer);
    const actual = normalizedAnswer(answers[question.id]);
    const correct = objective && expected.length === actual.length && expected.every((value, index) => value === actual[index]);
    const earned = correct ? Number(reference.score || question.defaultScore || 0) : 0;
    if (!objective) manualReview = true;
    score += earned;
    results[question.id] = { objective, correct, score: earned };
  }
  return { score, manualReview, results };
}

function submissionSimilarity(left, right) {
  const tokens = value => new Set(String(value || '').toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, ' ').split(/\s+/).filter(token => token.length > 1));
  const a = tokens(left); const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  a.forEach(token => { if (b.has(token)) intersection += 1; });
  return Math.round(intersection / (a.size + b.size - intersection) * 100);
}

function dataForActor(data, actor) {
  if (!actor || actor.role !== 'student') {
    const studentDirectory = authRequired && ['teacher', 'admin'].includes(actor?.role)
      ? loadAuth().accounts.filter(account => account.role === 'student').map(account => ({ accountId: account.id, username: account.username, name: account.name, enabled: account.enabled !== false }))
      : [];
    return { ...data, studentDirectory };
  }
  const labs = data.labs.filter(lab => lab.state === '已发布' && studentCanAccessLab(data, lab.id, actor)).map(lab => {
    const sanitizeEvaluation = evaluation => {
      const { fillBlankAnswer, ...safeEvaluation } = evaluation || {};
      return { ...safeEvaluation, referenceAnswers: (evaluation?.referenceAnswers || []).map(({ content, ...answer }) => answer), tests: (evaluation?.tests || []).map(test => test.visibility === 'hidden' ? { id: test.id, name: '隐藏测试', visibility: 'hidden', expected: '正式评测时保密', weight: test.weight, required: test.required } : test) };
    };
    return { ...lab, evaluationConfig: sanitizeEvaluation(lab.evaluationConfig), checkpoints: (lab.checkpoints || []).map(checkpoint => ({ ...checkpoint, evaluationConfig: sanitizeEvaluation(checkpoint.evaluationConfig) })) };
  });
  const courses = data.courses.filter(course => ['已发布', '已公开', '进行中', '公开申请中'].includes(course.status) && (course.visibility !== '私有课程' || (course.members || []).some(member => member.accountId === actor.id))).map(course => {
    const reviewTargets = (course.submissions || []).filter(submission => submission.studentId !== actor.id && !(submission.groupMemberIds || []).includes(actor.id) && (course.assignments || []).some(task => task.id === submission.activityId && task.peerReview && task.status === '已发布')).map(submission => {
      const task = (course.assignments || []).find(item => item.id === submission.activityId);
      return { id: submission.id, activityId: submission.activityId, content: submission.content, attachmentUrl: submission.attachmentUrl, submittedAt: submission.submittedAt, studentName: task?.anonymousReview ? '匿名同学' : submission.studentName };
    });
    return { ...course, roleApplications: [], messages: (course.messages || []).filter(item => item.senderId === actor.id || item.recipientId === actor.id || item.recipientId === 'all-students'), assignmentGroups: (course.assignmentGroups || []).filter(item => (item.memberIds || []).includes(actor.id)), surveys: (course.surveys || []).filter(item => item.status === '已发布'), surveyResponses: (course.surveyResponses || []).filter(item => item.studentId === actor.id), attendanceSessions: (course.attendanceSessions || []).filter(item => item.status !== '草稿'), attendanceRecords: (course.attendanceRecords || []).filter(item => item.studentId === actor.id), submissions: (course.submissions || []).filter(item => item.studentId === actor.id || (item.groupMemberIds || []).includes(actor.id)), peerReviewTargets: reviewTargets, peerReviews: (course.peerReviews || []).filter(item => item.reviewerId === actor.id || (course.submissions || []).some(submission => submission.id === item.submissionId && (submission.studentId === actor.id || (submission.groupMemberIds || []).includes(actor.id)))), gradeAppeals: (course.gradeAppeals || []).filter(item => item.studentId === actor.id) };
  });
  const visibleQuestionIds = new Set(courses.flatMap(course => course.exams || []).flatMap(exam => (exam.questionRefs || []).map(reference => reference.questionId)));
  const questionBank = (data.questionBank || []).filter(question => visibleQuestionIds.has(question.id)).map(({ answers, answer, explanation, ...question }) => question);
  const { studentProgressByAccount, studentDirectory, ...safeData } = data;
  return { ...safeData, studentProgress: progressForActor(data, actor), labs, courses, questionBank };
}
function pinCourseRepositoryReferences(courses = [], labs = []) {
  return courses.map(course => ({
    ...course,
    exams: (Array.isArray(course.exams) ? course.exams : []).map(exam => ({
      ...exam,
      labReferences: (Array.isArray(exam.labReferences) ? exam.labReferences : []).map(reference => {
        const value = reference && typeof reference === 'object' ? reference : {};
        const [labId, checkpointId] = typeof reference === 'string' ? reference.split(':') : [value.labId, value.checkpointId];
        const lab = labs.find(item => item.id === labId);
        const checkpoint = lab?.checkpoints?.find(item => item.id === checkpointId);
        return { labId, checkpointId, commitSha: value.commitSha || checkpoint?.repositoryRef?.commitSha || lab?.repository?.headCommit || '' };
      }),
    })),
  }));
}
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function requestBodyError(message, statusCode) { const error = new Error(message); error.statusCode = statusCode; return error; }
function readBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let receivedBytes = 0;
    let exceeded = false;
    req.on('data', chunk => {
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) { exceeded = true; chunks.length = 0; return; }
      if (!exceeded) chunks.push(chunk);
    });
    req.on('end', () => {
      if (exceeded) return reject(requestBodyError(`请求体不能超过 ${Math.ceil(maxBytes / 1024 / 1024)} MiB`, 413));
      try {
        const raw = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(requestBodyError('请求体不是有效 JSON', 400));
      }
    });
    req.on('error', reject);
  });
}
const isWindows = process.platform === 'win32';
const wslPath = process.env.WSL_PATH || (isWindows ? 'C:\\Windows\\System32\\wsl.exe' : '/usr/sbin/runuser');
const distro = process.env.CLOUDLAB_WSL_DISTRO || 'CloudLabUbuntu';
const labUser = 'cloudlab';
const workspace = '/home/cloudlab/workspace';
const allowedCommands = new Set(['pwd', 'whoami', 'id', 'date', 'uname', 'ls', 'mkdir', 'touch', 'cat', 'chmod', 'stat', 'find', 'grep', 'head', 'tail', 'echo', 'printf']);

function loadAuth() {
  try {
    const data = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    return { accounts: Array.isArray(data.accounts) ? data.accounts : [], sessionSecret: String(data.sessionSecret || '') };
  } catch { return { accounts: [], sessionSecret: '' }; }
}
function saveAuth(data) {
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  const temporary = `${authFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, authFile);
}
function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}
function passwordMatches(password, account) {
  try {
    const actual = crypto.scryptSync(String(password), account.salt, 64);
    const expected = Buffer.from(account.passwordHash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => part.trim().split('=')).filter(pair => pair.length === 2).map(([key, value]) => [key, decodeURIComponent(value)]));
}
function authWithSessionSecret() {
  const auth = loadAuth();
  if (!/^[A-Za-z0-9_-]{43,}$/.test(auth.sessionSecret)) {
    auth.sessionSecret = crypto.randomBytes(48).toString('base64url');
    saveAuth(auth);
  }
  return auth;
}
function signedSessionToken(account) {
  const auth = authWithSessionSecret();
  const payload = Buffer.from(JSON.stringify({ sub: account.id, exp: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds, nonce: crypto.randomBytes(12).toString('base64url') })).toString('base64url');
  const signature = crypto.createHmac('sha256', auth.sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function sessionUser(req) {
  if (!authRequired) return { id: 'local-teacher', username: 'local-teacher', name: loadData().settings.teacherName || '本地教师', role: process.env.CLOUDLAB_DEFAULT_ROLE || 'teacher' };
  const [payload = '', signature = ''] = String(cookies(req).cloudlab_session || '').split('.');
  if (!payload || !signature) return null;
  const auth = authWithSessionSecret();
  const expected = crypto.createHmac('sha256', auth.sessionSecret).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  let claims;
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (!claims.sub || !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null;
  const account = auth.accounts.find(item => item.id === claims.sub && item.enabled !== false);
  return account ? publicUser(account) : null;
}
function publicUser(account) { return { id: account.id, username: account.username, name: account.name, role: account.role }; }
function setSession(res, account) {
  const token = signedSessionToken(account);
  res.setHeader('Set-Cookie', `cloudlab_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionLifetimeSeconds}${secureCookies ? '; Secure' : ''}`);
}
function loginAttemptKey(req, username) {
  return `${req.socket.remoteAddress || 'unknown'}:${String(username || '').trim().toLowerCase()}`;
}
function activeLoginFailures(key) {
  const attempt = failedLogins.get(key);
  if (!attempt || Date.now() - attempt.startedAt >= loginWindowMs) { failedLogins.delete(key); return null; }
  return attempt;
}
function recordLoginFailure(key) {
  const current = activeLoginFailures(key) || { count: 0, startedAt: Date.now() };
  current.count += 1;
  failedLogins.set(key, current);
  return current;
}

function runWsl(user, script, timeout = 8_000) {
  return new Promise((resolve, reject) => {
    const args = isWindows
      ? ['-d', distro, '-u', user, '--', 'bash', '-lc', script]
      : ['-u', user, '--', 'bash', '-lc', script];
    const child = spawn(wslPath, args, { windowsHide: true });
    let stdout = ''; let stderr = ''; let finished = false;
    const timer = setTimeout(() => { if (!finished) { child.kill(); finished = true; reject(new Error('命令执行超时（最多 8 秒）')); } }, timeout);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { if (!finished) { finished = true; clearTimeout(timer); reject(error); } });
    child.on('close', code => { if (!finished) { finished = true; clearTimeout(timer); resolve({ code: Number(code ?? -1), stdout: stdout.slice(0, 12_000), stderr: stderr.slice(0, 4_000) }); } });
  });
}
function labUsesBigDataCluster(lab) {
  return lab?.runtimeProfile === 'hadoop-spark';
}
function clusterHdfsRoot(lab) {
  return `/user/cloudlab/labs/${String(lab?.id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '-')}`;
}
async function clusterRuntimeStatus() {
  const script = [
    "if [ ! -x /opt/cloudlab-cluster/cluster-start.sh ]; then echo CONFIGURED=0; exit 0; fi",
    "echo CONFIGURED=1",
    "probe(){ timeout 2 bash -c \"echo >/dev/tcp/127.0.0.1/$1\" >/dev/null 2>&1 && echo 1 || echo 0; }",
    "echo NAMENODE=$(probe 9000)",
    "echo DATANODE=$(probe 9866)",
    "echo SPARK_MASTER=$(probe 7077)",
    "echo SPARK_WORKER_UI=$(probe 18081)",
    "spark_json=$(curl -fsS --max-time 3 http://127.0.0.1:18080/json/ 2>/dev/null || true)",
    "printf 'SPARK_JSON_B64=%s\\n' \"$(printf '%s' \"$spark_json\" | base64 -w0)\"",
  ].join('\n');
  const result = await runWsl(labUser, script, 15_000);
  const values = Object.fromEntries(result.stdout.split(/\r?\n/).filter(line => line.includes('=')).map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
  let spark = {};
  try { spark = JSON.parse(Buffer.from(values.SPARK_JSON_B64 || '', 'base64').toString('utf8')); } catch {}
  const configured = values.CONFIGURED === '1';
  const nameNode = values.NAMENODE === '1';
  const dataNode = values.DATANODE === '1';
  const master = values.SPARK_MASTER === '1';
  const workerUi = values.SPARK_WORKER_UI === '1';
  const workers = Array.isArray(spark.workers) ? spark.workers.filter(worker => worker.state === 'ALIVE').length : 0;
  return {
    configured,
    healthy: configured && nameNode && dataNode && master && workerUi && workers > 0,
    mode: '教学型单机集群',
    hadoop: { version: '3.5.0', nameNode, dataNode, replication: 1 },
    spark: { version: '3.5.9', master, worker: workerUi && workers > 0, workers },
    limits: { cpuCores: 1, memoryMiB: 2048, concurrency: '建议单任务串行运行' },
    error: result.code === 0 ? '' : (result.stderr.trim() || '集群状态读取失败'),
  };
}
function safeLabFilePath(value) {
  const target = String(value || '').trim().replace(/\\/g, '/');
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(target) || target.startsWith('/') || target.endsWith('/') || target.split('/').includes('..')) throw new Error('实验文件路径不安全');
  return target;
}
function wslWorkspaceForLab(labId, actor) {
  const safeId = String(labId || 'default').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 96) || 'default';
  if (!authRequired) return `/home/${labUser}/workspaces/${safeId}`;
  if (!actor?.id) throw new Error('实验工作区需要登录账号');
  const accountKey = crypto.createHash('sha256').update(String(actor.id)).digest('hex').slice(0, 32);
  return `/home/${labUser}/workspaces/accounts/${accountKey}/${safeId}`;
}
function wslLabFromRequest(req, fallbackLabId = '') {
  const labId = String(req.headers['x-lab-id'] || fallbackLabId || '').slice(0, 128);
  const data = loadData();
  const lab = data.labs.find(item => item.id === labId) || null;
  if (lab && authRequired && (lab.state !== '已发布' && sessionUser(req)?.role === 'student' || !studentCanAccessLab(data, lab.id, sessionUser(req)))) return null;
  return lab;
}
function wslRepositoryFiles(lab) {
  return (Array.isArray(lab?.repository?.files) ? lab.repository.files : [])
    .map(file => ({ path: safeLabFilePath(file.path), content: String(file.content || ''), readOnly: file.readOnly === true }));
}
async function ensureWslWorkspace(lab, actor, reset = false) {
  if (!lab?.id) throw new Error('实验不存在');
  const target = wslWorkspaceForLab(lab.id, actor);
  const files = wslRepositoryFiles(lab);
  const commands = [`mkdir -p -- '${target}'`];
  if (reset) commands.unshift(`rm -rf -- '${target}'`);
  commands.push(`if [ ! -f '${target}/.cloudlab-initialized' ]; then`);
  for (const file of files) {
    const parent = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
    if (parent) commands.push(`mkdir -p -- '${target}/${parent}'`);
    commands.push(`printf '%s' '${Buffer.from(file.content, 'utf8').toString('base64')}' | base64 -d > '${target}/${file.path}'`);
    commands.push(`chmod ${file.readOnly ? '444' : '644'} -- '${target}/${file.path}'`);
  }
  commands.push(`printf '%s' '${lab.id}' > '${target}/.cloudlab-initialized'`, 'fi');
  const result = await runWsl(labUser, commands.join('\n'), 20_000);
  if (result.code !== 0) throw new Error(result.stderr || 'WSL 实验工作区初始化失败');
  return target;
}
async function listWslFiles(lab, actor) {
  const target = await ensureWslWorkspace(lab, actor);
  const result = await runWsl(labUser, `cd '${target}' && find . -type f ! -name '.cloudlab-initialized' -printf '%P\\n' | sort`, 8_000);
  if (result.code !== 0) throw new Error(result.stderr || '实验文件列表读取失败');
  const readOnly = new Set(wslRepositoryFiles(lab).filter(file => file.readOnly).map(file => file.path));
  return { files: result.stdout.split(/\r?\n/).filter(Boolean).map(path => ({ path: safeLabFilePath(path), readOnly: readOnly.has(path) })) };
}
async function readWslFile(lab, actor, requestedPath) {
  const target = await ensureWslWorkspace(lab, actor);
  const filePath = safeLabFilePath(requestedPath);
  const result = await runWsl(labUser, `cd '${target}' && test -f '${filePath}' && head -c 1000000 -- '${filePath}' | base64 -w0`, 8_000);
  if (result.code !== 0) throw new Error('实验文件不存在或无法读取');
  return { path: filePath, content: Buffer.from(result.stdout.trim(), 'base64').toString('utf8'), readOnly: wslRepositoryFiles(lab).some(file => file.path === filePath && file.readOnly) };
}
async function writeWslFile(lab, actor, requestedPath, value) {
  const target = await ensureWslWorkspace(lab, actor);
  const filePath = safeLabFilePath(requestedPath);
  if (wslRepositoryFiles(lab).some(file => file.path === filePath && file.readOnly)) throw new Error('该文件为只读文件');
  const content = String(value ?? '');
  if (Buffer.byteLength(content, 'utf8') > 1_000_000) throw new Error('单个实验文件不能超过 1 MB');
  const parent = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
  const command = `${parent ? `mkdir -p -- '${parent}' && ` : ''}printf '%s' '${Buffer.from(content, 'utf8').toString('base64')}' | base64 -d > '${filePath}'`;
  const result = await runWsl(labUser, `cd '${target}' && ${command}`, 8_000);
  if (result.code !== 0) throw new Error(result.stderr || '实验文件保存失败');
  return { path: filePath, saved: true, bytes: Buffer.byteLength(content, 'utf8') };
}
function validateLabCommand(value, lab) {
  const command = String(value || '').trim();
  if (!command) throw new Error('请输入命令');
  if (command.length > 300) throw new Error('单条命令不能超过 300 个字符');
  if (/[\r\n;&|`$<>\\(){}]/.test(command)) throw new Error('受限实验环境不支持串联、重定向或子命令');
  const tokens = command.split(/\s+/);
  const first = tokens[0];
  if (labUsesBigDataCluster(lab) && first === 'spark-submit') {
    if (tokens.length !== 2 || !/^[A-Za-z0-9._/-]+\.py$/.test(tokens[1]) || tokens[1].startsWith('/') || tokens[1].split('/').includes('..')) throw new Error('Spark 提交格式为：spark-submit 相对路径.py');
    return `spark-submit --master spark://127.0.0.1:7077 --driver-memory 192m --executor-memory 256m --total-executor-cores 1 '${tokens[1]}'`;
  }
  if (labUsesBigDataCluster(lab) && first === 'hdfs') {
    if (tokens[1] !== 'dfs') throw new Error('仅允许使用 hdfs dfs 文件系统命令');
    const operation = tokens[2];
    if (!new Set(['-ls', '-mkdir', '-put', '-cat', '-du', '-count', '-touchz']).has(operation)) throw new Error('仅允许 HDFS 的查看、建目录、上传、读取和统计命令');
    const clusterRoot = clusterHdfsRoot(lab);
    const argumentsList = tokens.slice(3).filter(token => token !== '-p');
    if (!argumentsList.length) throw new Error('请填写 HDFS 路径');
    argumentsList.forEach((token, index) => {
      const isLocalPutSource = operation === '-put' && index === 0;
      if (isLocalPutSource) {
        if (!/^[A-Za-z0-9._/-]{1,160}$/.test(token) || token.startsWith('/') || token.split('/').includes('..')) throw new Error('上传源文件必须位于当前实验目录');
      } else if (!(token === clusterRoot || token.startsWith(`${clusterRoot}/`))) throw new Error(`HDFS 路径仅限 ${clusterRoot}`);
    });
    return tokens.join(' ');
  }
  if (!allowedCommands.has(first)) throw new Error(`仅允许基础实验命令：${[...allowedCommands].join('、')}`);
  if (/(?:^|\s)(?:~|\/|\.\.)(?:\/|\s|$)/.test(command)) throw new Error('仅允许操作当前实验工作目录中的相对路径');
  return command;
}
async function labStatus(lab, actor) {
  if (labUsesBigDataCluster(lab)) {
    const isSpark = /spark/i.test(String(lab.id || ''));
    const ports = isSpark ? [7077, 18081] : [9000, 9866];
    const probe = ports.map(port => `timeout 2 bash -c 'echo >/dev/tcp/127.0.0.1/${port}' >/dev/null 2>&1`).join(' && ');
    let ready = false;
    try { ready = (await runWsl(labUser, probe, 25_000)).code === 0; } catch {}
    if (!ready) return { available: false, distro, platform: lab.techPlatform || 'Linux', mode: '教学型单机集群', error: isSpark ? 'Spark 集群尚未启动，本实验暂不可用' : 'HDFS 集群尚未启动，本实验暂不可用' };
  }
  const activeWorkspace = lab?.id ? await ensureWslWorkspace(lab, actor) : workspace;
  const result = await runWsl(labUser, `cd '${activeWorkspace}' && printf 'user=' && whoami && printf '\\nworkspace=' && pwd && printf '\\nkernel=' && uname -r`);
  return { available: result.code === 0, distro, platform: lab?.techPlatform || 'Linux', mode: 'WSL 受限 Ubuntu 实验环境', details: result.stdout.trim(), error: result.stderr.trim() };
}
async function labTests() {
  const result = await runWsl(labUser, `cd ${workspace} && if [ -f notes.txt ]; then echo 'file=pass'; else echo 'file=fail'; fi; if [ -f notes.txt ] && [ "$(stat -c %a notes.txt)" = '600' ]; then echo 'permission=pass'; else echo 'permission=fail'; fi; stat -c 'actual=%a' notes.txt 2>/dev/null || true`);
  const lines = result.stdout.split(/\r?\n/);
  const filePassed = lines.includes('file=pass');
  const actual = lines.find(line => line.startsWith('actual='))?.slice(7) || '未创建';
  const permissionPassed = actual === '600';
  const checks = [
    { id: 'workspace', name: '实验工作目录检查', passed: result.code === 0, expected: workspace, actual: workspace },
    { id: 'file', name: 'notes.txt 文件检查', passed: filePassed, expected: '文件存在', actual: filePassed ? 'notes.txt 已创建' : '尚未创建 notes.txt' },
    { id: 'permission', name: '文件权限检查', passed: permissionPassed, expected: '600', actual }
  ];
  return { passed: checks.every(check => check.passed), checks };
}
function staticFile(res, pathname) {
  const vendorFiles = {
    '/vendor/xterm.mjs': path.join(root, 'node_modules', '@xterm', 'xterm', 'lib', 'xterm.mjs'),
    '/vendor/addon-fit.mjs': path.join(root, 'node_modules', '@xterm', 'addon-fit', 'lib', 'addon-fit.mjs'),
    '/vendor/xterm.css': path.join(root, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css')
  };
  const requestPath = pathname === '/' ? '/portal.html' : pathname;
  const safePath = vendorFiles[pathname] || path.normalize(path.join(root, requestPath));
  if (!safePath.startsWith(root)) return json(res, 403, { message: '禁止访问该路径' });
  const gitRoot = path.resolve(gitRepositories.status().repositoriesRoot);
  if (path.resolve(safePath) === gitRoot || path.resolve(safePath).startsWith(`${gitRoot}${path.sep}`) || /(?:^|[\\/])\.git(?:[\\/]|$)/i.test(safePath)) return json(res, 403, { message: '禁止直接访问 Git 仓库存储' });
  if ([dataFile, authFile].some(file => path.resolve(file) === path.resolve(safePath) || path.basename(file).toLowerCase() === path.basename(safePath).toLowerCase()) || /(?:^|[\\/])(?:cloudlab-auth|local-data)\.json$/i.test(safePath)) return json(res, 403, { message: '禁止访问平台数据文件' });
  const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' }[path.extname(safePath)] || 'application/octet-stream';
  fs.readFile(safePath, (error, content) => { if (error) return json(res, error.code === 'ENOENT' ? 404 : 500, { message: '文件不存在' }); res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(content); });
}

function uploadedFile(res, pathname, options = {}) {
  const match = pathname.match(/^\/uploads\/([a-f0-9-]{36})\/([^/]+)$/i);
  if (!match) return json(res, 404, { message: '上传文件不存在' });
  const id = match[1];
  const name = path.basename(decodeURIComponent(match[2])).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 180);
  const target = path.join(uploadsDir, id, name);
  if (!path.resolve(target).startsWith(`${uploadsDir}${path.sep}`)) return json(res, 403, { message: '禁止访问该路径' });
  const type = { '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.zip': 'application/zip', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }[path.extname(name).toLowerCase()] || 'application/octet-stream';
  const disposition = options.download === true ? 'attachment' : 'inline';
  fs.readFile(target, (error, content) => { if (error) return json(res, error.code === 'ENOENT' ? 404 : 500, { message: '上传文件不存在' }); res.writeHead(200, { 'Content-Type': type, 'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`, 'Content-Length': content.length, 'Cache-Control': 'private, max-age=300' }); res.end(content); });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4173'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Terminal-Session,X-Lab-Id,X-Lab-Formal,X-Checkpoint-Id,X-Repository-Commit,X-Course-Id,X-Exam-Id');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'UP', service: '学生实践平台服务' });
    if (req.method === 'GET' && url.pathname === '/api/auth/session') {
      const auth = loadAuth();
      const user = sessionUser(req);
      return json(res, 200, { authRequired, authenticated: Boolean(user), setupRequired: authRequired && auth.accounts.length === 0, user });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/setup') {
      if (!authRequired) return json(res, 400, { message: '当前未启用账号认证' });
      const auth = loadAuth();
      if (auth.accounts.length) return json(res, 409, { message: '平台账号已经初始化' });
      const body = await readBody(req);
      const username = String(body.username || '').trim().slice(0, 80);
      const name = String(body.name || '').trim().slice(0, 80);
      const password = String(body.password || '');
      if (!/^[A-Za-z0-9._-]{3,80}$/.test(username) || password.length < 8 || !name) return json(res, 400, { message: '用户名需为 3-80 位字符，密码至少 8 位，并填写姓名' });
      const hashed = passwordHash(password);
      const account = { id: crypto.randomUUID(), username, name, role: 'admin', salt: hashed.salt, passwordHash: hashed.hash, enabled: true, createdAt: new Date().toISOString() };
      auth.accounts.push(account); saveAuth(auth); setSession(res, account);
      return json(res, 201, { user: publicUser(account) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readBody(req);
      const username = String(body.username || '').trim();
      const attemptKey = loginAttemptKey(req, username);
      const existingFailures = activeLoginFailures(attemptKey);
      if (existingFailures?.count >= maxLoginFailures) {
        const retryAfter = Math.max(1, Math.ceil((loginWindowMs - (Date.now() - existingFailures.startedAt)) / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        return json(res, 429, { message: '登录尝试过于频繁，请稍后再试' });
      }
      const account = loadAuth().accounts.find(item => item.enabled !== false && item.username === username);
      if (!account || !passwordMatches(body.password, account)) {
        recordLoginFailure(attemptKey);
        return json(res, 401, { message: '用户名或密码不正确' });
      }
      failedLogins.delete(attemptKey);
      setSession(res, account);
      return json(res, 200, { user: publicUser(account) });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      res.setHeader('Set-Cookie', `cloudlab_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookies ? '; Secure' : ''}`);
      return json(res, 200, { loggedOut: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/accounts') {
      const actor = sessionUser(req);
      if (!actor || actor.role !== 'admin') return json(res, 403, { message: '仅管理员可创建平台账号' });
      const body = await readBody(req);
      const username = String(body.username || '').trim().slice(0, 80);
      const name = String(body.name || '').trim().slice(0, 80);
      const password = String(body.password || '');
      const role = ['teacher', 'student', 'admin'].includes(body.role) ? body.role : 'student';
      const auth = loadAuth();
      if (!/^[A-Za-z0-9._-]{3,80}$/.test(username) || password.length < 8 || !name) return json(res, 400, { message: '账号信息不完整' });
      if (auth.accounts.some(item => item.username === username)) return json(res, 409, { message: '用户名已存在' });
      const hashed = passwordHash(password);
      const account = { id: crypto.randomUUID(), username, name, role, salt: hashed.salt, passwordHash: hashed.hash, enabled: true, createdAt: new Date().toISOString() };
      auth.accounts.push(account); saveAuth(auth);
      return json(res, 201, { user: publicUser(account) });
    }
    if (authRequired && url.pathname.startsWith('/api/') && !sessionUser(req)) return json(res, 401, { message: '请先登录学生实践平台' });
    const assignmentAttachmentMatch = url.pathname.match(/^\/api\/courses\/([^/]+)\/assignments\/([^/]+)\/attachment$/);
    if (req.method === 'GET' && assignmentAttachmentMatch) {
      const courseId = decodeURIComponent(assignmentAttachmentMatch[1]);
      const assignmentId = decodeURIComponent(assignmentAttachmentMatch[2]);
      const actor = sessionUser(req);
      const data = loadData();
      const course = data.courses.find(item => item.id === courseId);
      const assignment = course?.assignments?.find(item => item.id === assignmentId);
      const studentAccess = !authRequired || (actor?.role === 'student' && studentCanAccessCourse(course, actor));
      const staffAccess = actor && ['teacher', 'admin'].includes(actor.role);
      if (!course || !assignment || !assignment.assignmentAttachmentUrl) return json(res, 404, { message: '作业附件不存在' });
      if (!staffAccess && (!studentAccess || course.status !== '已发布' || assignment.status !== '已发布')) return json(res, 403, { message: '你无权下载该作业附件' });
      let attachmentPath = '';
      try { attachmentPath = new URL(assignment.assignmentAttachmentUrl, `http://${req.headers.host || 'localhost'}`).pathname; } catch { return json(res, 400, { message: '作业附件地址无效' }); }
      if (!attachmentPath.startsWith('/uploads/')) return json(res, 400, { message: '该作业附件不是平台上传的文件' });
      return uploadedFile(res, attachmentPath, { download: true });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) {
      if (authRequired && !sessionUser(req)) return json(res, 401, { message: '请先登录学生实践平台' });
      return uploadedFile(res, url.pathname);
    }
    if (req.method === 'POST' && url.pathname === '/api/uploads') {
      const actor = sessionUser(req);
      if (!actor || !['teacher', 'admin'].includes(actor.role)) return json(res, 403, { message: '仅教师或管理员可上传教学文件' });
      const body = await readBody(req, 15 * 1024 * 1024);
      const originalName = path.basename(String(body.name || 'resource.bin')).replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 180) || 'resource.bin';
      const encoded = String(body.contentBase64 || '');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return json(res, 400, { message: '上传内容不是有效的 Base64 数据' });
      const content = Buffer.from(encoded, 'base64');
      if (!content.length || content.length > 10 * 1024 * 1024) return json(res, 400, { message: '文件大小必须在 1 字节到 10 MiB 之间' });
      const id = crypto.randomUUID();
      const directory = path.join(uploadsDir, id);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, originalName), content, { flag: 'wx' });
      return json(res, 201, { id, name: originalName, size: content.length, mimeType: String(body.mimeType || 'application/octet-stream').slice(0, 120), url: `/uploads/${id}/${encodeURIComponent(originalName)}`, uploadedAt: new Date().toISOString(), uploadedBy: actor.name });
    }
    if (req.method === 'POST' && url.pathname === '/api/classrooms/join') {
      const actor = sessionUser(req);
      if (authRequired && actor?.role !== 'student') return json(res, 403, { message: '仅学生账号可通过邀请码加入课堂' });
      const body = await readBody(req);
      const inviteCode = String(body.inviteCode || '').trim().slice(0, 32);
      const data = loadData();
      const course = data.courses.find(item => ['已发布', '已公开', '公开申请中'].includes(item.status) && (item.classrooms || []).some(room => room.inviteCode === inviteCode && !room.closed));
      if (!course) return json(res, 404, { message: '邀请码无效、课堂已关闭或课程尚未发布' });
      const student = actor?.role === 'student' ? actor : { id: String(body.studentId || 'student-current').slice(0, 128), name: String(body.studentName || '当前学生').slice(0, 80), username: '' };
      course.members = Array.isArray(course.members) ? course.members : [];
      let member = course.members.find(item => item.accountId === student.id);
      if (!member) { member = { id: crypto.randomUUID(), accountId: student.id, name: student.name, identifier: student.username || '', email: '', role: '学生', status: '正常', classId: String(body.classId || ''), joinedAt: new Date().toISOString(), joinMethod: '邀请码' }; course.members.push(member); }
      saveData(data);
      return json(res, 200, { courseId: course.id, courseName: course.name, member });
    }
    if (req.method === 'POST' && url.pathname === '/api/classrooms/role-application') {
      const actor = sessionUser(req);
      if (authRequired && actor?.role !== 'student') return json(res, 403, { message: '仅学生账号可提交角色申请' });
      const body = await readBody(req);
      const data = loadData();
      const course = data.courses.find(item => item.id === String(body.courseId || ''));
      const member = course?.members?.find(item => item.accountId === (actor?.id || body.studentId));
      if (!course || !member || !course.allowRoleApplication) return json(res, 400, { message: '课程未开放角色申请或申请人尚未加入课堂' });
      course.roleApplications = Array.isArray(course.roleApplications) ? course.roleApplications : [];
      const existing = course.roleApplications.find(item => item.accountId === member.accountId && item.status === '待审核');
      if (existing) return json(res, 409, { message: '已有待审核申请' });
      const application = { id: crypto.randomUUID(), accountId: member.accountId, memberId: member.id, name: member.name, requestedRole: body.requestedRole === '教师' ? '教师' : '助教', reason: String(body.reason || '').trim().slice(0, 1000), status: '待审核', createdAt: new Date().toISOString() };
      course.roleApplications.unshift(application); saveData(data); return json(res, 201, application);
    }
    if (req.method === 'POST' && url.pathname === '/api/messages') {
      const actor = sessionUser(req);
      const body = await readBody(req);
      const data = loadData();
      const course = data.courses.find(item => item.id === String(body.courseId || ''));
      if (!course) return json(res, 404, { message: '课程不存在' });
      const senderRole = authRequired ? actor?.role : (body.senderRole === 'student' ? 'student' : 'teacher');
      if (authRequired && !['student', 'teacher', 'admin'].includes(senderRole)) return json(res, 403, { message: '当前账号无权发送课程消息' });
      if (authRequired && senderRole === 'student' && !studentCanAccessCourse(course, actor)) return json(res, 403, { message: '你尚未加入该课程' });
      const senderId = String((authRequired ? actor?.id : body.senderId) || '').slice(0, 128);
      const senderName = String((authRequired ? actor?.name : body.senderName) || (senderRole === 'student' ? '学生' : '课程教师')).slice(0, 80);
      let recipientId = String(body.recipientId || '').slice(0, 128);
      let recipientName = '课程教师';
      if (senderRole === 'student') recipientId = 'course-teachers';
      else if (recipientId === 'all-students') recipientName = '全体学生';
      else {
        const member = (course.members || []).find(item => item.accountId === recipientId || item.id === recipientId);
        if (!member || member.role !== '学生') return json(res, 400, { message: '收件人不是该课程的学生成员' });
        recipientName = member.name;
      }
      const subject = String(body.subject || '').trim().slice(0, 120);
      const content = String(body.content || '').trim().slice(0, 5000);
      if (!subject || !content) return json(res, 400, { message: '消息主题和内容不能为空' });
      course.messages = Array.isArray(course.messages) ? course.messages : [];
      const message = { id: crypto.randomUUID(), courseId: course.id, senderId, senderName, senderRole, recipientId, recipientName, subject, content, createdAt: new Date().toISOString() };
      course.messages.unshift(message); saveData(data); return json(res, 201, { message });
    }
    if (req.method === 'POST' && url.pathname === '/api/surveys/respond') {
      const actor = sessionUser(req);
      if (authRequired && actor?.role !== 'student') return json(res, 403, { message: '仅学生账号可提交问卷' });
      const body = await readBody(req);
      const data = loadData();
      const course = data.courses.find(item => item.id === String(body.courseId || ''));
      const survey = course?.surveys?.find(item => item.id === String(body.surveyId || '') && item.status === '已发布');
      if (!course || !survey) return json(res, 404, { message: '问卷不存在或尚未发布' });
      if (authRequired && !studentCanAccessCourse(course, actor)) return json(res, 403, { message: '你尚未加入该课程' });
      const now = Date.now();
      if (survey.startAt && now < new Date(survey.startAt).getTime()) return json(res, 409, { message: '问卷尚未开放' });
      if (survey.dueAt && now > new Date(survey.dueAt).getTime()) return json(res, 409, { message: '问卷已截止' });
      const student = actor?.role === 'student' ? actor : { id: String(body.studentId || 'student-current').slice(0, 128), name: String(body.studentName || '当前学生').slice(0, 80) };
      const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? body.answers : {};
      for (const question of survey.questions || []) {
        const answer = answers[question.id];
        if (question.required !== false && (answer == null || answer === '' || (Array.isArray(answer) && !answer.length))) return json(res, 400, { message: `请完成必答题：${question.title}` });
      }
      course.surveyResponses = Array.isArray(course.surveyResponses) ? course.surveyResponses : [];
      const existing = course.surveyResponses.find(item => item.surveyId === survey.id && item.studentId === student.id);
      if (existing && !survey.allowResubmit) return json(res, 409, { message: '该问卷不允许重复提交' });
      const timestamp = new Date().toISOString();
      const response = { ...(existing || {}), id: existing?.id || crypto.randomUUID(), courseId: course.id, surveyId: survey.id, studentId: student.id, studentName: survey.anonymous ? '匿名学生' : student.name, answers, submittedAt: existing?.submittedAt || timestamp, updatedAt: timestamp };
      if (existing) course.surveyResponses[course.surveyResponses.indexOf(existing)] = response; else course.surveyResponses.unshift(response);
      saveData(data); return json(res, 200, { response });
    }
    if (req.method === 'POST' && url.pathname === '/api/discussions/reply') {
      const actor = sessionUser(req);
      if (authRequired && actor?.role !== 'student') return json(res, 403, { message: '仅学生账号可参与课堂讨论' });
      const body = await readBody(req);
      const data = loadData();
      const course = data.courses.find(item => item.id === String(body.courseId || ''));
      const discussion = course?.discussions?.find(item => item.id === String(body.discussionId || '') && item.status === '已发布');
      const content = String(body.content || '').trim().slice(0, 5000);
      if (!course || !discussion) return json(res, 404, { message: '讨论主题不存在或尚未发布' });
      if (authRequired && !studentCanAccessCourse(course, actor)) return json(res, 403, { message: '你尚未加入该课程' });
      if (!content) return json(res, 400, { message: '回复内容不能为空' });
      const student = actor?.role === 'student' ? actor : { id: String(body.studentId || 'student-current').slice(0, 128), name: String(body.studentName || '当前学生').slice(0, 80) };
      course.discussionReplies = Array.isArray(course.discussionReplies) ? course.discussionReplies : [];
      const reply = { id: crypto.randomUUID(), courseId: course.id, discussionId: discussion.id, studentId: student.id, studentName: student.name, content, createdAt: new Date().toISOString() };
      course.discussionReplies.push(reply); saveData(data); return json(res, 201, { reply });
    }
    if (req.method === 'POST' && url.pathname === '/api/attendance/check-in') {
      const actor = sessionUser(req);
      if (authRequired && actor?.role !== 'student') return json(res, 403, { message: '仅学生账号可签到' });
      const body = await readBody(req);
      const data = loadData();
      const course = data.courses.find(item => item.id === String(body.courseId || ''));
      const session = course?.attendanceSessions?.find(item => item.id === String(body.sessionId || ''));
      if (!course || !session) return json(res, 404, { message: '签到任务不存在' });
      if (authRequired && !studentCanAccessCourse(course, actor)) return json(res, 403, { message: '你尚未加入该课程' });
      if (session.status !== '进行中') return json(res, 400, { message: '签到尚未开始或已结束' });
      if (String(body.code || '').trim() !== String(session.code || '')) return json(res, 400, { message: '签到码错误' });
      const now = Date.now();
      const startedAt = new Date(session.startedAt || now).getTime();
      if (Number.isFinite(startedAt) && now > startedAt + Math.max(1, Number(session.durationMinutes || 10)) * 60000) {
        session.status = '已结束'; session.endedAt = new Date(now).toISOString(); saveData(data);
        return json(res, 400, { message: '本次签到已超过有效时间' });
      }
      const student = actor?.role === 'student' ? actor : { id: String(body.studentId || 'student-current').slice(0, 128), name: String(body.studentName || '当前学生').slice(0, 80) };
      if (session.sectionId) {
        const member = (course.members || []).find(item => item.accountId === student.id || item.id === student.id || item.identifier === student.id);
        if (member && member.classId !== session.sectionId) return json(res, 403, { message: '本次签到仅面向指定班级' });
      }
      course.attendanceRecords = Array.isArray(course.attendanceRecords) ? course.attendanceRecords : [];
      const existing = course.attendanceRecords.find(item => item.sessionId === session.id && item.studentId === student.id);
      if (existing) return json(res, 409, { message: '你已完成本次签到' });
      const record = { id: crypto.randomUUID(), courseId: course.id, sessionId: session.id, studentId: student.id, studentName: student.name, checkedInAt: new Date(now).toISOString(), late: false };
      course.attendanceRecords.push(record); saveData(data); return json(res, 201, { record });
    }
    if (req.method === 'GET' && url.pathname === '/api/repositories/status') { const actor = sessionUser(req); return actor && ['teacher', 'admin'].includes(actor.role) ? json(res, 200, gitRepositories.status()) : json(res, 403, { message: '仅教师或管理员可查看仓库状态' }); }
    const repositoryMatch = url.pathname.match(/^\/api\/repositories\/([^/]+)\/(history|diff|file|rollback)$/);
    if (repositoryMatch) {
      const actor = sessionUser(req);
      if (!actor || !['teacher', 'admin'].includes(actor.role)) return json(res, 403, { message: '仅教师或管理员可管理代码仓库' });
      const labId = decodeURIComponent(repositoryMatch[1]).slice(0, 128);
      const action = repositoryMatch[2];
      const data = loadData();
      const lab = data.labs.find(item => item.id === labId);
      if (!lab?.repository || lab.repository.storage !== 'git') return json(res, 404, { message: '实验尚未关联 Git 仓库' });
      if (req.method === 'GET' && action === 'history') return json(res, 200, { commits: await gitRepositories.repositoryHistory(lab.repository, Number(url.searchParams.get('limit') || 30)) });
      if (req.method === 'GET' && action === 'diff') return json(res, 200, { diff: await gitRepositories.repositoryDiff(lab.repository, url.searchParams.get('from'), url.searchParams.get('to') || lab.repository.headCommit) });
      if (req.method === 'GET' && action === 'file') {
        const snapshot = await gitRepositories.repositorySnapshot(lab.repository, url.searchParams.get('ref') || lab.repository.headCommit);
        const target = gitRepositories.safePath(url.searchParams.get('path'));
        const file = snapshot.files.find(item => item.path === target);
        return file ? json(res, 200, { ...file, commitSha: snapshot.commitSha }) : json(res, 404, { message: '仓库文件不存在' });
      }
      if (req.method === 'POST' && action === 'rollback') {
        const body = await readBody(req);
        const restored = await gitRepositories.restoreRepository(lab.repository, String(body.commitSha || ''), actor);
        lab.repository = { ...lab.repository, headCommit: restored.headCommit, commitMessage: `回滚到版本 ${String(body.commitSha || '').slice(0, 8)}`, filePaths: restored.files.map(file => file.path), readOnlyPaths: restored.files.filter(file => file.readOnly).map(file => file.path) };
        lab.checkpoints = (lab.checkpoints || []).map(checkpoint => ({ ...checkpoint, repositoryRef: { branch: lab.repository.defaultBranch || 'main', commitSha: restored.headCommit } }));
        lab.updatedAt = new Date().toISOString();
        saveData(data);
        return json(res, 200, { headCommit: restored.headCommit, lab: repositoryLabForClient(await gitRepositories.hydrateLabRepository(lab)) });
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/terminal/status') { syncTerminalCapacity(); return json(res, 200, terminalGateway.status()); }
    if (req.method === 'PUT' && url.pathname === '/api/admin/terminal-capacity') {
      const actor = sessionUser(req);
      if (!actor || actor.role !== 'admin') return json(res, 403, { message: '仅管理员可分配终端容器数量' });
      const body = await readBody(req);
      const maxSessions = Number(body.maxSessions);
      if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 200) return json(res, 400, { message: '可连接容器数量必须是 1 到 200 之间的整数' });
      const data = loadData();
      data.settings = { ...data.settings, terminalMaxSessions: maxSessions, terminalMaxSessionsPerIp: 0 };
      saveData(data);
      syncTerminalCapacity(data);
      return json(res, 200, { saved: true, ...terminalGateway.status() });
    }
    if (req.method === 'GET' && url.pathname === '/api/cluster/status') return json(res, 200, await clusterRuntimeStatus());
    if (req.method === 'POST' && url.pathname === '/api/terminal/session') { const body = await readBody(req); const labId = String(body.labId || '').slice(0, 128); const checkpointId = String(body.checkpointId || '').slice(0, 128); const commitSha = String(body.commitSha || '').slice(0, 64); const sourceLab = wslLabFromRequest(req, labId); if (authRequired && !sourceLab) return json(res, 403, { message: '无权访问该实验' }); const lab = await hydratedLabCheckpoint(sourceLab || {}, checkpointId, commitSha); syncTerminalCapacity(); const issued = await terminalGateway.issueToken(req, lab); return json(res, issued.status, issued.body); }
    if (req.method === 'GET' && url.pathname === '/api/cloud/adapter-status') {
      const terminal = terminalGateway.status();
      return json(res, 200, { configured: terminal.enabled, provider: 'docker-terminal', desktopAvailable: false, message: '平台仅提供代码文件与命令行实验能力。' });
    }
    if (req.method === 'GET' && url.pathname === '/api/lab/status') {
      if (terminalGateway.status().enabled) {
        const availability = await terminalGateway.terminalAvailable();
        const labId = String(url.searchParams.get('labId') || '').slice(0, 128);
        const sourceLab = loadData().labs.find(item => item.id === labId) || {};
        const lab = await hydratedLabCheckpoint(sourceLab, String(url.searchParams.get('checkpointId') || '').slice(0, 128), String(url.searchParams.get('commitSha') || '').slice(0, 64));
        return json(res, 200, { ...availability, platform: lab.techPlatform || 'Linux', mode: 'Docker 隔离实验环境', durationMinutes: Math.min(Number(lab.duration || 120), terminalGateway.status().limits.maxMinutes) });
      }
      const lab = wslLabFromRequest(req, url.searchParams.get('labId'));
      if (authRequired && !lab) return json(res, 403, { message: '无权访问该实验' });
      return json(res, 200, await labStatus(lab, sessionUser(req)));
    }
    if (req.method === 'POST' && url.pathname === '/api/lab/execute') {
      const body = await readBody(req);
      const lab = wslLabFromRequest(req, body.labId);
      if (authRequired && !lab) return json(res, 403, { message: '无权访问该实验' });
      if (labUsesBigDataCluster(lab) && !(await labStatus(lab, sessionUser(req))).available) return json(res, 503, { message: '集群尚未启动，本实验暂不可用' });
      const command = validateLabCommand(body.command, lab);
      const activeWorkspace = lab ? await ensureWslWorkspace(lab, sessionUser(req)) : workspace;
      const environment = labUsesBigDataCluster(lab) ? "source /opt/cloudlab-cluster/cluster-env.sh && export HADOOP_CLIENT_OPTS='-Xms24m -Xmx64m -XX:+UseSerialGC' && " : '';
      const result = await runWsl(labUser, `${environment}cd '${activeWorkspace}' && ${command}`, labUsesBigDataCluster(lab) ? 300_000 : 8_000);
      return json(res, 200, { command, exitCode: result.code, output: result.stdout || result.stderr || '(命令执行完成，无输出)' });
    }
    if (req.method === 'POST' && url.pathname === '/api/lab/reset') {
      const terminalResult = await terminalGateway.resetWorkspace(req);
      if (terminalResult) return json(res, terminalResult.reset ? 200 : 500, terminalResult);
      const lab = wslLabFromRequest(req);
      if (authRequired && !lab) return json(res, 403, { message: '无权访问该实验' });
      if (lab) {
        if (labUsesBigDataCluster(lab)) await runWsl(labUser, `source /opt/cloudlab-cluster/cluster-env.sh && hdfs dfs -rm -r -f '${clusterHdfsRoot(lab)}' >/dev/null 2>&1 || true`, 120_000);
        await ensureWslWorkspace(lab, sessionUser(req), true);
        return json(res, 200, { reset: true, output: labUsesBigDataCluster(lab) ? '实验工作目录与本实验 HDFS 数据已重置' : '实验工作目录已重置并恢复初始文件' });
      }
      const result = await runWsl(labUser, `cd ${workspace} && find . -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && printf '实验工作目录已重置\\n'`);
      return json(res, result.code === 0 ? 200 : 500, { reset: result.code === 0, output: result.stdout || result.stderr });
    }
    if (req.method === 'GET' && url.pathname === '/api/lab/files') {
      const result = await terminalGateway.listFiles(req);
      if (result) return json(res, 200, result);
      const lab = wslLabFromRequest(req);
      return lab ? json(res, 200, await listWslFiles(lab, sessionUser(req))) : json(res, authRequired ? 403 : 404, { message: authRequired ? '无权访问该实验' : '实验不存在' });
    }
    if (req.method === 'GET' && url.pathname === '/api/lab/file') {
      const result = await terminalGateway.readFile(req, url.searchParams.get('path'));
      if (result) return json(res, 200, result);
      const lab = wslLabFromRequest(req);
      return lab ? json(res, 200, await readWslFile(lab, sessionUser(req), url.searchParams.get('path'))) : json(res, authRequired ? 403 : 404, { message: authRequired ? '无权访问该实验' : '实验不存在' });
    }
    if ((req.method === 'POST' || req.method === 'PUT') && url.pathname === '/api/lab/file') {
      const body = await readBody(req);
      const result = await terminalGateway.writeFile(req, body.path, body.content);
      if (result) return json(res, 200, result);
      const lab = wslLabFromRequest(req, body.labId);
      return lab ? json(res, 200, await writeWslFile(lab, sessionUser(req), body.path, body.content)) : json(res, authRequired ? 403 : 404, { message: authRequired ? '无权访问该实验' : '实验不存在' });
    }
    if (req.method === 'POST' && url.pathname === '/api/lab/test') {
      const labId = String(req.headers['x-lab-id'] || '').slice(0, 128);
      const checkpointId = String(req.headers['x-checkpoint-id'] || '').slice(0, 128);
      const commitSha = String(req.headers['x-repository-commit'] || '').slice(0, 64);
      const sourceLab = loadData().labs.find((item) => item.id === labId) || {};
      const actor = sessionUser(req);
      if (authRequired && (!sourceLab.id || !studentCanAccessLab(loadData(), labId, actor))) return json(res, 403, { message: '无权访问该实验' });
      const lab = await hydratedLabCheckpoint(sourceLab, checkpointId, commitSha);
      if (labUsesBigDataCluster(lab) && !(await labStatus(lab, actor)).available) return json(res, 503, { message: '集群尚未启动，本实验暂不可用' });
      const formal = String(req.headers['x-lab-formal'] || '') === 'true';
      const courseId = String(req.headers['x-course-id'] || '').slice(0, 128);
      const examId = String(req.headers['x-exam-id'] || '').slice(0, 128);
      if (formal && authRequired && examId) {
        const course = loadData().courses.find(item => item.id === courseId);
        const exam = course?.exams?.find(item => item.id === examId && item.status === '已发布');
        if (!exam || !studentCanAccessCourse(course, actor) || !examLinksLab(exam, labId, lab.checkpointId || checkpointId)) return json(res, 403, { message: '实验与考试关联无效' });
      }
      const terminalReport = await terminalGateway.runLabTests(req, lab);
      const activeWorkspace = terminalReport ? workspace : await ensureWslWorkspace(lab, actor);
      const environment = labUsesBigDataCluster(lab) ? "source /opt/cloudlab-cluster/cluster-env.sh && export HADOOP_CLIENT_OPTS='-Xms24m -Xmx64m -XX:+UseSerialGC' && " : '';
      const report = terminalReport || await terminalGateway.evaluateConfiguredTests((script, timeout) => runWsl(labUser, `${environment}cd '${activeWorkspace}' && ${script}`, timeout), lab, formal);
      if (formal && authRequired && actor?.role === 'student') {
        const data = loadData();
        const progress = progressForActor(data, actor);
        const deduction = Number(progress.answerDeductions?.[`lab:${labId}:${lab.checkpointId || checkpointId || ''}`] || 0);
        report.score = Math.max(0, report.score - deduction);
        report.passed = report.passed && (report.passPolicy !== 'score-threshold' || report.score >= Number(report.passingScore || 100));
        report.evaluationId = crypto.randomUUID();
        report.studentProgress = recordVerifiedLabEvaluation(data, actor, { evaluationId: report.evaluationId, labId, checkpointId: lab.checkpointId || checkpointId || '', courseId, examId, score: report.score, passed: report.passed });
        report.progressRecorded = true;
        saveData(data);
        evaluationReceipts.set(report.evaluationId, { actorId: actor.id, labId, checkpointId: lab.checkpointId || checkpointId || '', courseId, examId, score: report.score, passed: report.passed, recorded: true, expiresAt: Date.now() + 10 * 60_000 });
      }
      return json(res, 200, report);
    }
    if (req.method === 'POST' && url.pathname === '/api/lab/answer') {
      const actor = sessionUser(req);
      const body = await readBody(req);
      const data = loadData();
      const lab = data.labs.find(item => item.id === String(body.labId || ''));
      if (!lab || (authRequired && (actor?.role !== 'student' || lab.state !== '已发布' || !studentCanAccessLab(data, lab.id, actor)))) return json(res, 403, { message: '无权查看该实验答案' });
      const resolved = resolveLabCheckpoint(lab, String(body.checkpointId || ''));
      const index = Number(body.index);
      const answers = resolved.evaluationConfig?.referenceAnswers || [];
      if (!Number.isInteger(index) || index < 0 || index >= answers.length) return json(res, 404, { message: '参考答案不存在' });
      const answer = answers[index];
      if (authRequired) {
        const progress = progressForActor(data, actor);
        progress.answerDeductions ||= {};
        const key = `lab:${lab.id}:${resolved.checkpointId || ''}`;
        progress.answerDeductions[key] = Math.max(Number(progress.answerDeductions[key] || 0), Math.max(0, Math.min(100, Number(answer.deductionPercent || 0))));
        saveData(data);
      }
      return json(res, 200, { content: answer.content, deductionPercent: answer.deductionPercent });
    }
    if (req.method === 'GET' && url.pathname === '/api/lab-comments') {
      const labId = String(url.searchParams.get('labId') || '').slice(0, 128);
      const data = loadData();
      if (!data.labs.some(item => item.id === labId)) return json(res, 404, { message: '实验不存在' });
      return json(res, 200, { comments: data.labComments.filter(item => item.labId === labId).slice(0, 100) });
    }
    if (req.method === 'POST' && url.pathname === '/api/lab-comments') {
      const actor = sessionUser(req);
      const body = await readBody(req);
      const data = loadData();
      const labId = String(body.labId || '').slice(0, 128);
      const lab = data.labs.find(item => item.id === labId);
      const text = String(body.text || '').trim().slice(0, 1000);
      if (!lab) return json(res, 404, { message: '实验不存在' });
      if (!text) return json(res, 400, { message: '评论内容不能为空' });
      if (authRequired && !actor) return json(res, 401, { message: '请先登录' });
      const comment = { id: crypto.randomUUID(), labId, checkpointId: String(body.checkpointId || '').slice(0, 128), authorId: String(actor?.id || body.authorId || 'student-current').slice(0, 128), authorName: String(actor?.name || body.authorName || '当前学生').slice(0, 80), text, at: new Date().toISOString() };
      data.labComments.unshift(comment); data.labComments = data.labComments.slice(0, 5000); saveData(data);
      return json(res, 201, { comment });
    }
    if (req.method === 'GET' && url.pathname === '/api/bootstrap') { const data = url.searchParams.get('runtime') === '1' ? loadData() : await hydratedData(); return json(res, 200, dataForActor(data, sessionUser(req))); }
    if (req.method === 'POST' && url.pathname === '/api/bootstrap/delta') {
      const actor = sessionUser(req);
      if (!actor || !['teacher', 'admin'].includes(actor.role)) return json(res, 403, { message: '仅教师或管理员可修改教学数据' });
      const body = await readBody(req, bootstrapMaxBytes);
      if (![body.courses, body.labs, body.questionBank].every(value => value == null || Array.isArray(value))) return json(res, 400, { message: '课程、实验模板或题库增量格式不正确' });
      const current = loadData();
      const mergeById = (incoming = [], stored = []) => { const merged = [...incoming]; for (const item of stored) if (!merged.some(candidate => candidate.id === item.id)) merged.push(item); return merged; };
      const mergeCourseRuntime = (course, serverCourse) => serverCourse ? {
        ...course,
        members: mergeById(course.members, serverCourse.members?.filter(item => item.accountId)),
        roleApplications: mergeById(course.roleApplications, serverCourse.roleApplications),
        messages: serverCourse.messages || [],
        submissions: serverCourse.submissions || [],
        surveyResponses: serverCourse.surveyResponses || [],
        discussionReplies: serverCourse.discussionReplies || [],
        attendanceRecords: serverCourse.attendanceRecords || [],
        peerReviews: serverCourse.peerReviews || [],
        gradeAppeals: serverCourse.gradeAppeals || [],
      } : course;
      const reorder = (items, order) => {
        if (!Array.isArray(order)) return items;
        const byId = new Map(items.map(item => [item.id, item]));
        return [...order.map(id => byId.get(id)).filter(Boolean), ...items.filter(item => !order.includes(item.id))];
      };
      const deletedLabIds = new Set(Array.isArray(body.deletedLabIds) ? body.deletedLabIds.map(String) : []);
      let labs = current.labs.filter(item => !deletedLabIds.has(item.id));
      const persistedLabs = [];
      for (const incomingLab of body.labs || []) {
        const storedLab = current.labs.find(item => item.id === incomingLab.id);
        const lab = storedLab?.repository?.storage === 'git' ? { ...incomingLab, repository: { ...storedLab.repository, ...(incomingLab.repository || {}) } } : incomingLab;
        const persisted = await gitRepositories.persistLabRepository(lab, actor);
        persistedLabs.push(persisted);
        const index = labs.findIndex(item => item.id === persisted.id);
        if (index >= 0) labs[index] = persisted; else labs.push(persisted);
      }
      labs = reorder(labs, body.labOrder);
      const deletedCourseIds = new Set(Array.isArray(body.deletedCourseIds) ? body.deletedCourseIds.map(String) : []);
      let courses = current.courses.filter(item => !deletedCourseIds.has(item.id));
      for (const incomingCourse of pinCourseRepositoryReferences(body.courses || [], labs)) {
        const course = mergeCourseRuntime(incomingCourse, current.courses.find(item => item.id === incomingCourse.id));
        const index = courses.findIndex(item => item.id === course.id);
        if (index >= 0) courses[index] = course; else courses.push(course);
      }
      courses = reorder(courses, body.courseOrder);
      const deletedQuestionIds = new Set(Array.isArray(body.deletedQuestionIds) ? body.deletedQuestionIds.map(String) : []);
      let questionBank = current.questionBank.filter(item => !deletedQuestionIds.has(item.id));
      for (const question of body.questionBank || []) {
        const index = questionBank.findIndex(item => item.id === question.id);
        if (index >= 0) questionBank[index] = question; else questionBank.push(question);
      }
      questionBank = reorder(questionBank, body.questionOrder);
      const revision = Math.max(Number(body.revision || 0), Number(current.revision || 0));
      saveData({
        ...current,
        version: initialData.version,
        revision,
        courses,
        labs,
        questionBank,
        settings: body.settings && typeof body.settings === 'object' ? { ...current.settings, ...body.settings } : current.settings,
      });
      return json(res, 200, { saved: true, revision, repositories: persistedLabs.map(lab => ({ labId: lab.id, repository: repositoryForClient(lab.repository) })) });
    }
    if ((req.method === 'POST' || req.method === 'PUT') && url.pathname === '/api/bootstrap') {
      const actor = sessionUser(req);
      if (!actor || !['teacher', 'admin'].includes(actor.role)) return json(res, 403, { message: '仅教师或管理员可修改教学数据' });
      const body = await readBody(req, bootstrapMaxBytes);
      if (!Array.isArray(body.courses) || !Array.isArray(body.labs) || (body.questionBank != null && !Array.isArray(body.questionBank))) return json(res, 400, { message: '课程、实验模板或题库数据格式不正确' });
      const current = loadData();
      const incomingRevision = Number(body.revision || 0);
      const currentRevision = Number(current.revision || 0);
      if (incomingRevision && currentRevision && incomingRevision < currentRevision) return json(res, 200, { saved: false, stale: true, revision: currentRevision });
      const labs = [];
      for (const incomingLab of body.labs) {
        const storedLab = current.labs.find(item => item.id === incomingLab.id);
        const lab = storedLab?.repository?.storage === 'git' ? { ...incomingLab, repository: { ...storedLab.repository, ...(incomingLab.repository || {}) } } : incomingLab;
        labs.push(await gitRepositories.persistLabRepository(lab, actor));
      }
      const latest = loadData();
      const mergeById = (incoming = [], stored = []) => { const merged = [...incoming]; for (const item of stored) if (!merged.some(candidate => candidate.id === item.id)) merged.push(item); return merged; };
      const courses = pinCourseRepositoryReferences(body.courses, labs).map(course => {
        const serverCourse = latest.courses.find(item => item.id === course.id);
        return serverCourse ? { ...course, members: mergeById(course.members, serverCourse.members?.filter(item => item.accountId)), roleApplications: mergeById(course.roleApplications, serverCourse.roleApplications), messages: serverCourse.messages || [], submissions: serverCourse.submissions || [], surveyResponses: serverCourse.surveyResponses || [], discussionReplies: serverCourse.discussionReplies || [], attendanceRecords: serverCourse.attendanceRecords || [], peerReviews: serverCourse.peerReviews || [], gradeAppeals: serverCourse.gradeAppeals || [] } : course;
      });
      const revision = Math.max(incomingRevision, Number(latest.revision || 0));
      saveData({ version: initialData.version, revision, courses, labs, questionBank: Array.isArray(body.questionBank) ? body.questionBank : latest.questionBank, labComments: latest.labComments || [], settings: body.settings && typeof body.settings === 'object' ? { ...latest.settings, ...body.settings } : structuredClone(latest.settings), studentProgress: latest.studentProgress, studentProgressByAccount: latest.studentProgressByAccount || {} });
      return json(res, 200, { saved: true, revision, repositories: labs.map(lab => ({ labId: lab.id, repository: repositoryForClient(lab.repository) })) });
    }
    if (req.method === 'GET' && url.pathname === '/api/student-progress') { const data = loadData(); return json(res, 200, progressForActor(data, sessionUser(req))); }
    if (req.method === 'POST' && url.pathname === '/api/submissions') {
      const body = await readBody(req);
      const courseId = String(body.courseId || '').slice(0, 128);
      const activityId = String(body.activityId || '').slice(0, 128);
      const kind = body.kind === 'exam' ? 'exam' : 'assignment';
      const actor = sessionUser(req);
      if (authRequired && (!actor || actor.role !== 'student')) return json(res, 403, { message: '仅学生账号可提交学习任务' });
      const actorStudentId = String(actor?.role === 'student' ? actor.id : body.studentId || 'student-current').slice(0, 128);
      const content = String(body.content || '').trim().slice(0, 10_000);
      const attachmentUrl = String(body.attachmentUrl || '').trim().slice(0, 1000);
      if (!courseId || !activityId || !content) return json(res, 400, { message: '课程、任务和提交内容不能为空' });
      if (attachmentUrl && !/^https?:\/\//i.test(attachmentUrl)) return json(res, 400, { message: '附件地址必须是 HTTP 或 HTTPS 地址' });
      const data = loadData();
      const course = data.courses.find(item => item.id === courseId);
      const task = course && (kind === 'exam' ? course.exams : course.assignments)?.find(item => item.id === activityId && item.status === '已发布');
      if (!course || !task) return json(res, 404, { message: '任务不存在或尚未发布' });
      if (authRequired && !studentCanAccessCourse(course, actor)) return json(res, 403, { message: '你尚未加入该课程' });
      const group = kind === 'assignment' && task.type === '分组作业' ? (course.assignmentGroups || []).find(item => item.id === String(body.groupId || '') && item.assignmentId === activityId) : null;
      if (kind === 'assignment' && task.type === '分组作业' && (!group || !(group.memberIds || []).includes(actorStudentId))) return json(res, 403, { message: '你尚未加入该分组作业的小组' });
      if (group && (group.memberIds || []).length > Math.max(1, Number(task.groupSize || 5))) return json(res, 400, { message: '作业小组人数超过教师设置的上限' });
      const studentId = group ? `group:${group.id}` : actorStudentId;
      const studentName = group?.name || String(actor?.name || body.studentName || '当前学生').slice(0, 80);
      const now = new Date().toISOString();
      const dueTime = task.dueAt ? new Date(task.dueAt).getTime() : NaN;
      const late = Number.isFinite(dueTime) && Date.now() > dueTime;
      if (kind === 'assignment' && late && !task.allowLate) return json(res, 409, { message: '作业已截止且未开放补交' });
      if (kind === 'assignment' && task.attachmentRequired && !attachmentUrl) return json(res, 400, { message: '该作业要求提交附件或作品地址' });
      course.submissions = Array.isArray(course.submissions) ? course.submissions : [];
      const existing = course.submissions.find(item => item.activityId === activityId && item.studentId === studentId);
      const maximumAttempts = Math.max(1, Number(task.maxAttempts || 1));
      if (existing && Number(existing.attemptCount || 1) >= maximumAttempts && existing.status !== '需重做') return json(res, 409, { message: `本任务最多允许提交 ${maximumAttempts} 次` });
      const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? Object.fromEntries(Object.entries(body.answers).slice(0, 200).map(([key, value]) => [String(key).slice(0, 128), Array.isArray(value) ? value.slice(0, 50).map(item => String(item).slice(0, 5000)) : String(value || '').slice(0, 10_000)])) : {};
      const automatic = kind === 'exam' ? gradeExamQuestions(task, data.questionBank, answers) : { score: 0, manualReview: true, results: {} };
      const hasQuestions = kind === 'exam' && Array.isArray(task.questionRefs) && task.questionRefs.length > 0;
      const needsManualReview = automatic.manualReview || !hasQuestions || (task.labReferences || []).length > 0;
      const submissionStatus = kind === 'assignment' ? (late ? '迟交' : '已提交') : needsManualReview ? '待批阅' : '已批阅';
      const comparison = kind === 'assignment' && task.plagiarismCheck ? course.submissions.filter(item => item.activityId === activityId && item.studentId !== studentId).map(item => ({ id: item.id, studentName: item.studentName, similarity: submissionSimilarity(content, item.content) })).sort((a, b) => b.similarity - a.similarity)[0] : null;
      const submission = { ...(existing || {}), id: existing?.id || crypto.randomUUID(), courseId, activityId, kind, studentId, studentName, submittedById: actorStudentId, submittedByName: String(actor?.name || body.studentName || '当前学生').slice(0, 80), groupId: group?.id || '', groupMemberIds: group?.memberIds || [], content, attachmentUrl, answers, questionResults: automatic.results, status: submissionStatus, late, attemptCount: Number(existing?.attemptCount || 0) + 1, similarity: comparison?.similarity || 0, similarSubmissionId: comparison?.id || '', similarStudentName: comparison?.studentName || '', score: hasQuestions ? automatic.score : null, feedback: hasQuestions ? (needsManualReview ? '客观题已自动判分，主观题或实践题等待教师批阅' : '客观题自动评测完成') : '', firstSubmittedAt: existing?.firstSubmittedAt || now, submittedAt: now, gradedAt: kind === 'exam' && !needsManualReview ? now : '', updatedAt: now };
      if (existing) course.submissions[course.submissions.indexOf(existing)] = submission; else course.submissions.unshift(submission);
      const progress = progressForActor(data, actor);
      progress.resourceProgress ||= {};
      progress.resourceProgress[activityId] = { courseId, resourceId: activityId, status: '已完成', completedSubtasks: 1, totalSubtasks: 1, lastActivityAt: now, completedAt: now };
      progress.status = progress.status === '未开始' ? '进行中' : progress.status;
      progress.lastActivityAt = now;
      progress.history.unshift({ id: crypto.randomUUID(), kind: '操作', title: `提交${kind === 'exam' ? '考试' : '作业'}：${task.title}`, detail: course.name, courseId, resourceId: activityId, at: now });
      progress.history = progress.history.slice(0, 100);
      saveData(data);
      return json(res, 200, { submission, studentProgress: progress });
    }
    if (req.method === 'POST' && url.pathname === '/api/submissions/grade') {
      const actor = sessionUser(req);
      if (!actor || !['teacher', 'admin'].includes(actor.role)) return json(res, 403, { message: '仅教师或管理员可批阅成绩' });
      const body = await readBody(req);
      const courseId = String(body.courseId || '').slice(0, 128);
      const submissionId = String(body.submissionId || '').slice(0, 128);
      const data = loadData();
      const course = data.courses.find(item => item.id === courseId);
      const submission = course && (Array.isArray(course.submissions) ? course.submissions : []).find(item => item.id === submissionId);
      if (!course || !submission) return json(res, 404, { message: '提交记录不存在' });
      const task = [...(course.assignments || []), ...(course.exams || [])].find(item => item.id === submission.activityId);
      const maximum = Number(task?.totalScore || 100);
      const score = Number(body.score);
      if (!Number.isFinite(score) || score < 0 || score > maximum) return json(res, 400, { message: `成绩必须在 0 到 ${maximum} 之间` });
      const now = new Date().toISOString();
      submission.gradeHistory = Array.isArray(submission.gradeHistory) ? submission.gradeHistory : [];
      if (submission.score != null || submission.feedback) submission.gradeHistory.unshift({ score: submission.score, feedback: submission.feedback || '', changedAt: now, changedBy: actor.name });
      Object.assign(submission, { score, feedback: String(body.feedback || '').trim().slice(0, 3000), status: '已批阅', gradedAt: now, updatedAt: now, gradedBy: actor.name });
      saveData(data);
      return json(res, 200, { submission });
    }
    if (req.method === 'POST' && url.pathname === '/api/submissions/return') {
      const actor = sessionUser(req);
      if (!actor || !['teacher', 'admin'].includes(actor.role)) return json(res, 403, { message: '仅教师或管理员可退回作业' });
      const body = await readBody(req);
      const data = loadData();
      const course = data.courses.find(item => item.id === String(body.courseId || ''));
      const submission = course?.submissions?.find(item => item.id === String(body.submissionId || ''));
      if (!submission) return json(res, 404, { message: '提交记录不存在' });
      Object.assign(submission, { status: '需重做', feedback: String(body.feedback || '请根据教师意见修改后重新提交').trim().slice(0, 3000), returnedAt: new Date().toISOString(), returnedBy: actor.name, updatedAt: new Date().toISOString() });
      saveData(data); return json(res, 200, { submission });
    }
    if (req.method === 'POST' && url.pathname === '/api/peer-reviews') {
      const actor = sessionUser(req);
      if (authRequired && actor?.role !== 'student') return json(res, 403, { message: '仅学生账号可提交互评' });
      const body = await readBody(req);
      const data = loadData();
      const course = data.courses.find(item => item.id === String(body.courseId || ''));
      const submission = course?.submissions?.find(item => item.id === String(body.submissionId || ''));
      const task = course?.assignments?.find(item => item.id === submission?.activityId && item.peerReview && item.status === '已发布');
      if (!course || !submission || !task) return json(res, 404, { message: '互评任务不存在或未开放' });
      if (authRequired && !studentCanAccessCourse(course, actor)) return json(res, 403, { message: '你尚未加入该课程' });
      const reviewer = actor?.role === 'student' ? actor : { id: String(body.reviewerId || 'student-current').slice(0, 128), name: String(body.reviewerName || '当前学生').slice(0, 80) };
      if (submission.studentId === reviewer.id || (submission.groupMemberIds || []).includes(reviewer.id)) return json(res, 400, { message: '不能评价自己或本组的作业' });
      const score = Number(body.score);
      if (!Number.isFinite(score) || score < 0 || score > Number(task.totalScore || 100)) return json(res, 400, { message: `互评分数必须在 0 到 ${Number(task.totalScore || 100)} 之间` });
      const comment = String(body.comment || '').trim().slice(0, 3000);
      if (!comment) return json(res, 400, { message: '请填写互评意见' });
      course.peerReviews = Array.isArray(course.peerReviews) ? course.peerReviews : [];
      if (course.peerReviews.some(item => item.submissionId === submission.id && item.reviewerId === reviewer.id)) return json(res, 409, { message: '你已评价过该作业' });
      const review = { id: crypto.randomUUID(), courseId: course.id, activityId: submission.activityId, submissionId: submission.id, reviewerId: reviewer.id, reviewerName: task.anonymousReview ? '匿名同学' : reviewer.name, score, comment, createdAt: new Date().toISOString() };
      course.peerReviews.push(review); saveData(data); return json(res, 201, { review });
    }
    if (req.method === 'POST' && url.pathname === '/api/grade-appeals') {
      const actor = sessionUser(req);
      if (authRequired && actor?.role !== 'student') return json(res, 403, { message: '仅学生账号可提交成绩申诉' });
      const body = await readBody(req);
      const data = loadData();
      const course = data.courses.find(item => item.id === String(body.courseId || ''));
      const submission = course?.submissions?.find(item => item.id === String(body.submissionId || ''));
      const studentId = String(actor?.role === 'student' ? actor.id : body.studentId || 'student-current').slice(0, 128);
      if (!submission || (submission.studentId !== studentId && !(submission.groupMemberIds || []).includes(studentId)) || submission.status !== '已批阅') return json(res, 400, { message: '只能对本人或本组已批阅的成绩发起申诉' });
      const reason = String(body.reason || '').trim().slice(0, 3000);
      if (!reason) return json(res, 400, { message: '请填写申诉理由' });
      course.gradeAppeals = Array.isArray(course.gradeAppeals) ? course.gradeAppeals : [];
      if (course.gradeAppeals.some(item => item.submissionId === submission.id && item.status === '待处理')) return json(res, 409, { message: '该成绩已有待处理申诉' });
      const appeal = { id: crypto.randomUUID(), courseId: course.id, submissionId: submission.id, activityId: submission.activityId, studentId, studentName: submission.studentName, originalScore: submission.score, reason, status: '待处理', createdAt: new Date().toISOString() };
      course.gradeAppeals.unshift(appeal); saveData(data); return json(res, 201, { appeal });
    }
    if (req.method === 'POST' && url.pathname === '/api/grade-appeals/resolve') {
      const actor = sessionUser(req);
      if (!actor || !['teacher', 'admin'].includes(actor.role)) return json(res, 403, { message: '仅教师或管理员可处理成绩申诉' });
      const body = await readBody(req);
      const data = loadData();
      const course = data.courses.find(item => item.id === String(body.courseId || ''));
      const appeal = course?.gradeAppeals?.find(item => item.id === String(body.appealId || ''));
      const submission = course?.submissions?.find(item => item.id === appeal?.submissionId);
      if (!appeal || !submission || appeal.status !== '待处理') return json(res, 404, { message: '待处理申诉不存在' });
      const decision = body.decision === '通过' ? '已通过' : '已驳回';
      const newScore = body.newScore === '' || body.newScore == null ? submission.score : Number(body.newScore);
      const task = course.assignments?.find(item => item.id === submission.activityId) || course.exams?.find(item => item.id === submission.activityId);
      if (!Number.isFinite(newScore) || newScore < 0 || newScore > Number(task?.totalScore || 100)) return json(res, 400, { message: '调整后的成绩超出有效范围' });
      const now = new Date().toISOString();
      if (decision === '已通过' && newScore !== submission.score) {
        submission.gradeHistory = Array.isArray(submission.gradeHistory) ? submission.gradeHistory : [];
        submission.gradeHistory.unshift({ score: submission.score, feedback: submission.feedback || '', changedAt: now, changedBy: actor.name, reason: '成绩申诉复核' });
        submission.score = newScore; submission.updatedAt = now;
      }
      Object.assign(appeal, { status: decision, response: String(body.response || '').trim().slice(0, 3000), resolvedAt: now, resolvedBy: actor.name, resolvedScore: submission.score });
      saveData(data); return json(res, 200, { appeal, submission });
    }
    if (req.method === 'POST' && url.pathname === '/api/student-progress/resources') {
      const body = await readBody(req);
      const courseId = String(body.courseId || '').slice(0, 128);
      const resourceId = String(body.resourceId || '').slice(0, 128);
      if (!courseId || !resourceId) return json(res, 400, { message: '课程和资源不能为空' });
      const data = loadData();
      const course = data.courses.find(item => item.id === courseId);
      const resource = course && [course.resources, course.assignments, course.exams, course.discussions, course.moduleItems].flatMap(items => Array.isArray(items) ? items : []).find(item => item.id === resourceId);
      if (!course || !resource) return json(res, 404, { message: '课程资源不存在' });
      if (authRequired && !studentCanAccessCourse(course, sessionUser(req))) return json(res, 403, { message: '你尚未加入该课程' });
      const now = new Date().toISOString();
      const status = body.status === '已完成' ? '已完成' : '学习中';
      const progress = progressForActor(data, sessionUser(req));
      progress.resourceProgress ||= {};
      const previous = progress.resourceProgress[resourceId] || {};
      progress.resourceProgress[resourceId] = { ...previous, courseId, resourceId, status, completedSubtasks: status === '已完成' ? Number(resource.subtasks || 1) : Math.max(1, Number(previous.completedSubtasks || 0)), totalSubtasks: Number(resource.subtasks || 1), lastActivityAt: now, completedAt: status === '已完成' ? now : previous.completedAt || '' };
      progress.lastActivityAt = now;
      if (progress.status === '未开始') progress.status = '进行中';
      progress.history.unshift({ id: crypto.randomUUID(), kind: '操作', title: `${status === '已完成' ? '完成' : '学习'}资源：${resource.name}`, detail: `${course.name} · ${resource.type}`, courseId, resourceId, at: now });
      progress.history = progress.history.slice(0, 100);
      saveData(data);
      return json(res, 200, progress);
    }
    if (req.method === 'POST' && url.pathname === '/api/student-progress/events') {
      const body = await readBody(req);
      const data = loadData();
      const actor = sessionUser(req);
      const progress = progressForActor(data, actor);
      const now = new Date().toISOString();
      const kind = body.kind === '评测' ? '评测' : '操作';
      const title = String(body.title || '').trim().slice(0, 120);
      const detail = String(body.detail || '').trim().slice(0, 500);
      const courseId = String(body.courseId || '').slice(0, 128);
      const labId = String(body.labId || '').slice(0, 128);
      const checkpointId = String(body.checkpointId || '').slice(0, 128);
      const examId = String(body.examId || '').slice(0, 128);
      if (!title) return json(res, 400, { message: '记录标题不能为空' });
      let verifiedResult = null;
      if (kind === '评测' && authRequired) {
        const receiptId = String(body.evaluationId || '');
        verifiedResult = evaluationReceipts.get(receiptId);
        if (!verifiedResult || verifiedResult.expiresAt < Date.now() || verifiedResult.actorId !== actor?.id || verifiedResult.labId !== labId || verifiedResult.checkpointId !== checkpointId || verifiedResult.courseId !== courseId || verifiedResult.examId !== examId) return json(res, 403, { message: '请先运行正式评测，再提交结果' });
        evaluationReceipts.delete(receiptId);
        if (verifiedResult.recorded) return json(res, 200, progress);
      }
      const passed = verifiedResult ? verifiedResult.passed : body.passed === true;
      if (kind === '评测') {
        recordVerifiedLabEvaluation(data, actor, { evaluationId: verifiedResult ? body.evaluationId : '', labId, checkpointId, courseId, examId, score: verifiedResult ? verifiedResult.score : body.score, passed, title, detail, now });
      } else {
        progress.lastActivityAt = now;
        if (progress.status === '未开始') progress.status = '进行中';
        progress.history.unshift({ id: crypto.randomUUID(), kind, title, detail, courseId, labId, resourceId: labId ? `lab:${labId}` : '', at: now });
        progress.history = progress.history.slice(0, 100);
      }
      saveData(data);
      return json(res, 200, progress);
    }
    if (req.method === 'POST' && url.pathname === '/api/courses') { const actor = sessionUser(req); if (!actor || !['teacher', 'admin'].includes(actor.role)) return json(res, 403, { message: '仅教师或管理员可创建课程' }); const body = await readBody(req); if (!body.name || !body.code) return json(res, 400, { message: '课程名称和课程编号不能为空' }); const data = loadData(); const course = { id: crypto.randomUUID(), name: String(body.name), code: String(body.code), students: 0, labs: 0, status: '进行中' }; data.courses.push(course); saveData(data); return json(res, 201, course); }
    return staticFile(res, url.pathname);
  } catch (error) { return json(res, Number(error.statusCode) || 500, { message: error.message || '本地服务发生异常' }); }
});
terminalGateway.attach(server);
if (require.main === module) {
  server.listen(port, host, () => console.log(`学生实践平台服务已启动：http://${host}:${port}/portal.html`));
}

module.exports = { server, loadData, validateLabCommand };
