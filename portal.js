const DATA_VERSION = 2;
const apiBase = window.location.protocol === "http:" || window.location.protocol === "https:" ? "/api" : null;
const moduleDefinitions = [
  ["plan", "教学计划", "讲次排课与教学进度"],
  ["notice", "通知公告", "重要信息及时触达"],
  ["lab", "课堂实验", "在线实操与自动评测"],
  ["assignment", "图文作业", "提交作品与教师批阅"],
  ["exam", "在线考试", "在线答题与阅卷"],
  ["resource", "教学资料", "课件与教学文件"],
  ["analytics", "数据统计", "学习过程与教学成效"],
  ["class", "课堂分班", "按班级组织学生"],
  ["programming", "编程作业", "代码作业与自动评测"],
  ["group", "分组作业", "团队协作与分组提交"],
  ["lesson-prep", "智慧备课", "教学设计与备课资源"],
  ["survey", "问卷调查", "课程反馈与教学调查"],
  ["attendance", "在线签到", "课堂签到与出勤统计"],
  ["discussion", "互动讨论", "课堂话题交流"],
  ["live", "视频直播", "直播授课与回放"],
  ["graduation", "毕业设计", "选题、过程与答辩管理"],
  ["knowledge-graph", "知识图谱", "课程知识关系与学习路径"],
  ["engineering", "工程认证", "达成度与认证材料"],
  ["ai-agent", "AI 智能体", "课程专属智能助教"],
  ["ai-knowledge", "AI 知识库", "课程资料检索与问答"],
];

const moduleCategories = {
  "作业考试": ["assignment", "exam", "programming", "group"],
  "教学工具": ["plan", "notice", "class", "survey", "attendance", "discussion"],
  "教学拓展": ["lesson-prep", "live", "graduation", "engineering"],
  "教学资源": ["lab", "resource", "knowledge-graph", "ai-agent", "ai-knowledge"],
  "数据统计": ["analytics"],
};

const moduleCategory = (id) => Object.entries(moduleCategories).find(([, ids]) => ids.includes(id))?.[0] || "其他";
const extensionModuleIds = ["lesson-prep", "live", "graduation", "engineering", "ai-agent", "ai-knowledge"];

const defaultStore = {
  version: DATA_VERSION,
  role: "teacher",
  page: "home",
  selectedCourseId: null,
  courses: [],
  labs: [],
  questionBank: [],
  settings: { teacherName: "", institution: "" },
  studentDirectory: [],
  studentProgress: {
    status: "未开始",
    score: null,
    attempts: 0,
    completedAt: "",
    lastActivityAt: "",
    history: [],
    gradeRecords: [],
    resourceProgress: {},
  },
  studentProgressByAccount: {},
  filters: { courseQuery: "", courseStatus: "全部", studentCourseTab: "all", courseWorkspaceTab: "overview", courseResourceQuery: "" },
};

function cleanStore(data = {}) {
  return {
    ...structuredClone(defaultStore),
    ...data,
    version: DATA_VERSION,
    courses: Array.isArray(data.courses) ? data.courses : [],
    labs: Array.isArray(data.labs) ? data.labs : [],
    questionBank: Array.isArray(data.questionBank) ? data.questionBank : [],
    settings: { ...defaultStore.settings, ...(data.settings || {}) },
    studentDirectory: Array.isArray(data.studentDirectory) ? data.studentDirectory : [],
    studentProgress: {
      ...defaultStore.studentProgress,
      ...(data.studentProgress || {}),
      history: Array.isArray(data.studentProgress?.history) ? data.studentProgress.history : [],
      gradeRecords: Array.isArray(data.studentProgress?.gradeRecords) ? data.studentProgress.gradeRecords : [],
      resourceProgress: data.studentProgress?.resourceProgress && typeof data.studentProgress.resourceProgress === "object" ? data.studentProgress.resourceProgress : {},
    },
    studentProgressByAccount: data.studentProgressByAccount && typeof data.studentProgressByAccount === "object" ? data.studentProgressByAccount : {},
    filters: { ...defaultStore.filters, ...(data.filters || {}) },
  };
}

function loadStore() {
  try {
    const saved = JSON.parse(localStorage.getItem("cloudlab-local-data"));
    if (saved?.version === DATA_VERSION) return cleanStore(saved);
  } catch {}
  localStorage.removeItem("cloudlab-local-data");
  return cleanStore();
}

const store = loadStore();
const requestedView = new URLSearchParams(location.search);
if (/^[a-z-]+$/.test(requestedView.get("page") || "")) store.page = requestedView.get("page");
if (requestedView.get("courseId")) store.selectedCourseId = requestedView.get("courseId");
let authState = { authRequired: false, authenticated: !apiBase, setupRequired: false, user: null };
const currentStudentId = () => authState.user?.role === "student" ? authState.user.id : "student-current";
const currentStudentName = () => authState.user?.role === "student" ? authState.user.name : "当前学生";
const adminRuntime = { loading: true, health: null, terminal: null, cloud: null, cluster: null, checkedAt: "", errors: [] };
const $ = (selector, root = document) => root.querySelector(selector);
const main = $("#mainView");
const browserFetch = globalThis.fetch.bind(globalThis);
let handlingExpiredSession = false;

globalThis.fetch = async (...args) => {
  const response = await browserFetch(...args);
  const requestUrl = String(typeof args[0] === "string" ? args[0] : args[0]?.url || "");
  const isAuthRequest = /\/api\/auth\/(?:session|login|setup|logout)(?:[/?]|$)/.test(requestUrl);
  if (response.status === 401 && authState.authRequired && !isAuthRequest && !handlingExpiredSession) {
    handlingExpiredSession = true;
    queueMicrotask(() => {
      authState = { authRequired: true, authenticated: false, setupRequired: false, user: null };
      closeModal();
      showAuthScreen(false);
      $("#authError").textContent = "登录状态已失效，请重新登录后继续操作。";
      handlingExpiredSession = false;
    });
  }
  return response;
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function uid(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function selected(value, expected) {
  return value === expected ? "selected" : "";
}

function checked(value) {
  return value ? "checked" : "";
}

function splitList(value) {
  return String(value || "").split(/[，,\n]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeAnswer(value) {
  const list = Array.isArray(value) ? value : splitList(value);
  return list.map((item) => String(item).trim().toLowerCase()).filter(Boolean).sort();
}

function parseQuestionOptions(value) {
  if (Array.isArray(value)) return value.map((option, index) => ({ key: String(option.key || String.fromCharCode(65 + index)).trim().toUpperCase(), text: String(option.text || "").trim() })).filter((option) => option.text);
  return String(value || "").split(/\r?\n/).map((line, index) => {
    const parts = line.split(/[|｜]/);
    return { key: String(parts.length > 1 ? parts.shift() : String.fromCharCode(65 + index)).trim().toUpperCase(), text: parts.join("|").trim() };
  }).filter((option) => option.text);
}

function questionById(id) {
  return store.questionBank.find((question) => question.id === id);
}

function examQuestions(exam = {}) {
  return (exam.questionRefs || []).map((reference) => ({ reference, question: questionById(reference.questionId) })).filter((entry) => entry.question);
}

function gradeObjectiveQuestions(exam = {}, answers = {}) {
  let score = 0;
  let manualReview = false;
  const results = {};
  examQuestions(exam).forEach(({ reference, question }) => {
    const expected = normalizeAnswer(question.answers || question.answer);
    const actual = normalizeAnswer(answers[question.id]);
    const objective = !["简答题", "组合题"].includes(question.type);
    const correct = objective && expected.length === actual.length && expected.every((value, index) => value === actual[index]);
    if (!objective) manualReview = true;
    if (correct) score += Number(reference.score || question.defaultScore || 0);
    results[question.id] = { correct, objective, score: correct ? Number(reference.score || question.defaultScore || 0) : 0 };
  });
  return { score, manualReview, results };
}

function defaultEvaluationConfig() {
  return {
    passPolicy: "all-required",
    scoringRule: "weighted",
    passingScore: 100,
    whitespacePolicy: "exact",
    caseSensitive: true,
    studentFiles: ["notes.txt"],
    executionFile: "平台内置安全评测器",
    outputType: "文本结果",
    tests: [
      { id: uid("test"), name: "实验工作目录检查", visibility: "public", ruleType: "workspace-accessible", target: ".", expected: "/home/cloudlab/workspace", weight: 10, required: true },
      { id: uid("test"), name: "notes.txt 文件检查", visibility: "public", ruleType: "file-exists", target: "notes.txt", expected: "文件存在", weight: 40, required: true },
      { id: uid("test"), name: "文件权限检查", visibility: "hidden", ruleType: "file-mode", target: "notes.txt", expected: "600", weight: 50, required: true },
    ],
    referenceAnswers: [
      { id: uid("answer"), name: "提示一", content: "使用 touch notes.txt 创建文件。", deductionPercent: 10 },
      { id: uid("answer"), name: "完整操作", content: "touch notes.txt\nchmod 600 notes.txt\nstat -c \"%a %n\" notes.txt", deductionPercent: 30 },
    ],
  };
}

function normalizedEvaluation(lab = {}) {
  const fallback = defaultEvaluationConfig();
  const value = lab.evaluationConfig && typeof lab.evaluationConfig === "object" ? lab.evaluationConfig : {};
  return {
    ...fallback,
    ...value,
    studentFiles: Array.isArray(value.studentFiles) ? value.studentFiles : fallback.studentFiles,
    tests: Array.isArray(value.tests) && value.tests.length ? value.tests : fallback.tests,
    referenceAnswers: Array.isArray(value.referenceAnswers) ? value.referenceAnswers : fallback.referenceAnswers,
  };
}

function normalizedRepository(lab = {}) {
  const files = Array.isArray(lab.repository?.files) ? lab.repository.files : Array.isArray(lab.initialFiles) ? lab.initialFiles : [];
  return {
    ...(lab.repository || {}),
    branch: String(lab.repository?.branch || "main"),
    revision: Math.max(1, Number(lab.repository?.revision || 1)),
    commitMessage: String(lab.repository?.commitMessage || "初始化实验仓库"),
    commits: Array.isArray(lab.repository?.commits) ? lab.repository.commits : [],
    files,
  };
}

function normalizedCheckpoints(lab = {}) {
  if (Array.isArray(lab.checkpoints) && lab.checkpoints.length) return lab.checkpoints.map((checkpoint, index) => ({
    ...checkpoint,
    id: checkpoint.id || `checkpoint-${index + 1}`,
    name: checkpoint.name || `第 ${index + 1} 关`,
    evaluationConfig: normalizedEvaluation(checkpoint),
  }));
  return [{
    id: "checkpoint-legacy",
    name: lab.checkpointName || lab.name || "第 1 关",
    objectives: lab.objectives || "",
    description: lab.description || "",
    knowledge: lab.knowledge || "",
    requirements: lab.requirements || "",
    testDescription: lab.testDescription || "",
    difficulty: lab.difficulty || "初级",
    rewardExperience: Number(lab.rewardExperience || 0),
    maxExecutionSeconds: Number(lab.maxExecutionSeconds || 8),
    evaluationConfig: normalizedEvaluation(lab),
  }];
}

function labReadiness(lab = {}) {
  const checkpoints = normalizedCheckpoints(lab);
  const errors = [];
  if (!String(lab.name || "").trim()) errors.push("实验名称");
  if (!normalizedRepository(lab).files.length) errors.push("至少一个仓库文件");
  if (!checkpoints.length) errors.push("至少一个关卡");
  if (!lab.builtIn) errors.push("运行环境");
  checkpoints.forEach((checkpoint, index) => {
    const evaluation = normalizedEvaluation(checkpoint);
    const prefix = `第 ${index + 1} 关`;
    if (!String(checkpoint.objectives || "").trim()) errors.push(`${prefix}实验目标`);
    if (!String(checkpoint.requirements || "").trim()) errors.push(`${prefix}操作要求`);
    if (!evaluation.tests.some((item) => item.visibility === "public")) errors.push(`${prefix}公开测试`);
    if (!evaluation.tests.some((item) => item.visibility === "hidden")) errors.push(`${prefix}隐藏测试`);
    if (!evaluation.tests.every((item) => item.name && item.ruleType && Number(item.weight) >= 0)) errors.push(`${prefix}完整测试项`);
    if (evaluation.passPolicy === "score-threshold" && !(Number(evaluation.passingScore) > 0 && Number(evaluation.passingScore) <= 100)) errors.push(`${prefix}通过分数`);
  });
  return { ready: errors.length === 0, errors };
}

function courseReadiness(course = {}) {
  const errors = [];
  if (!String(course.learningObjectives || "").trim()) errors.push("课程目标");
  if (!String(course.summary || "").trim()) errors.push("课程简介");
  if (!(course.modules || []).length) errors.push("至少一个课堂模块");
  if (!(course.stages || []).length) errors.push("至少一个课程阶段");
  const invalidLab = (course.stages || []).map((stage) => store.labs.find((lab) => lab.id === stage.labId)).find((lab) => lab && lab.state !== "已发布");
  if (invalidLab) errors.push(`已发布的实验“${invalidLab.name}”`);
  return { ready: errors.length === 0, errors };
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
}

async function ensureActiveSession() {
  if (!apiBase || !authState.authRequired) return true;
  try {
    const response = await fetch(`${apiBase}/auth/session`, { cache: "no-store" });
    const current = await response.json();
    if (current.authenticated && ["teacher", "admin"].includes(current.user?.role)) {
      authState = current;
      return true;
    }
    authState = { ...current, authRequired: true, authenticated: false, user: null };
    closeModal();
    showAuthScreen(false);
    $("#authError").textContent = current.authenticated ? "当前账号没有教师管理权限。" : "登录状态已失效，请重新登录后继续操作。";
    return false;
  } catch {
    toast("暂时无法验证教师登录状态，请检查平台服务");
    return false;
  }
}

let saveSequence = 0;
let saveRequestQueue = Promise.resolve();
let lastSyncedSnapshot = null;
const saveRetryDelays = [0, 800, 2400];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function syncSnapshot(payload) {
  return structuredClone({ version: DATA_VERSION, revision: Number(payload.revision || 0), courses: payload.courses || [], labs: payload.labs || [], questionBank: payload.questionBank || [], settings: payload.settings || {} });
}

function changedEntities(current = [], previous = []) {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  return current.filter((item) => !previousById.has(item.id) || JSON.stringify(item) !== JSON.stringify(previousById.get(item.id)));
}

function deletedEntityIds(current = [], previous = []) {
  const currentIds = new Set(current.map((item) => item.id));
  return previous.map((item) => item.id).filter((id) => !currentIds.has(id));
}

function bootstrapDelta(payload) {
  const previous = lastSyncedSnapshot || { courses: [], labs: [], questionBank: [], settings: {} };
  return {
    version: DATA_VERSION,
    revision: payload.revision,
    courses: changedEntities(payload.courses, previous.courses),
    labs: changedEntities(payload.labs, previous.labs),
    questionBank: changedEntities(payload.questionBank, previous.questionBank),
    deletedCourseIds: deletedEntityIds(payload.courses, previous.courses),
    deletedLabIds: deletedEntityIds(payload.labs, previous.labs),
    deletedQuestionIds: deletedEntityIds(payload.questionBank, previous.questionBank),
    courseOrder: payload.courses.map((item) => item.id),
    labOrder: payload.labs.map((item) => item.id),
    questionOrder: payload.questionBank.map((item) => item.id),
    settings: JSON.stringify(payload.settings) === JSON.stringify(previous.settings) ? undefined : payload.settings,
  };
}

async function syncBootstrapPayload(payload) {
  const delta = bootstrapDelta(payload);
  let lastError;
  for (let attempt = 0; attempt < saveRetryDelays.length; attempt += 1) {
    if (saveRetryDelays[attempt]) await wait(saveRetryDelays[attempt]);
    try {
      const response = await fetch(`${apiBase}/bootstrap/delta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(delta) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body.message || `服务器返回 HTTP ${response.status}`);
        error.status = response.status;
        if (response.status < 500 || attempt === saveRetryDelays.length - 1) throw error;
        lastError = error;
        continue;
      }
      return body;
    } catch (error) {
      lastError = error;
      if (error.status && error.status < 500) throw error;
      if (attempt === saveRetryDelays.length - 1) throw error;
    }
  }
  throw lastError || new Error("服务器同步失败");
}

function saveStore() {
  const localPayload = {
    version: DATA_VERSION,
    revision: Date.now() * 1000 + (++saveSequence % 1000),
    courses: structuredClone(store.courses),
    labs: structuredClone(store.labs),
    questionBank: structuredClone(store.questionBank),
    settings: structuredClone(store.settings),
  };
  localStorage.setItem("cloudlab-local-data", JSON.stringify({ ...localPayload, role: store.role, page: store.page, selectedCourseId: store.selectedCourseId }));
  if (!apiBase) return Promise.resolve({ saved: true, localOnly: true });
  const operation = saveRequestQueue.catch(() => {}).then(async () => {
      const payload = { version: DATA_VERSION, revision: Date.now() * 1000 + (++saveSequence % 1000), courses: structuredClone(store.courses), labs: structuredClone(store.labs), questionBank: structuredClone(store.questionBank), settings: structuredClone(store.settings) };
      const body = await syncBootstrapPayload(payload);
      if (Array.isArray(body.repositories)) {
        body.repositories.forEach((entry) => {
          const lab = store.labs.find((item) => item.id === entry.labId);
          if (!lab || !entry.repository?.headCommit) return;
          lab.repository = { ...lab.repository, ...entry.repository };
          lab.checkpoints = (lab.checkpoints || []).map((checkpoint) => ({ ...checkpoint, repositoryRef: { branch: entry.repository.defaultBranch || "main", commitSha: entry.repository.headCommit } }));
        });
      }
      lastSyncedSnapshot = syncSnapshot({ ...payload, labs: store.labs });
      return { saved: true, body };
    });
  saveRequestQueue = operation.catch(() => {});
  return operation.catch((error) => {
    if (error.status !== 401) toast(`修改已保存在本机，服务器暂未同步：${error.message || "网络连接失败"}`);
    return { saved: false, error };
  });
}

function openLab(labId = "", options = {}) {
  const allowedPages = new Set(["home", "learning", "student-course", "practice", "grades", "records", "labs"]);
  const returnPage = options.teacherPreview ? "labs" : allowedPages.has(store.page) ? store.page : "learning";
  const query = new URLSearchParams({ returnPage });
  query.set("ui", "20261108-3");
  if (options.teacherPreview) query.set("teacherPreview", "1");
  const courseId = options.courseId || (returnPage === "student-course" ? store.selectedCourseId : "");
  if (courseId) query.set("courseId", courseId);
  if (options.checkpointId) query.set("checkpointId", options.checkpointId);
  if (options.examId) query.set("examId", options.examId);
  if (labId) query.set("labId", labId);
  location.href = `index.html?${query}`;
}

async function loadServerData() {
  if (!apiBase) return false;
  try {
    const response = await fetch(`${apiBase}/bootstrap`);
    if (!response.ok) return false;
    const data = await response.json();
    if (data.version !== DATA_VERSION || !Array.isArray(data.courses) || !Array.isArray(data.labs)) return false;
    store.courses = data.courses;
    store.labs = data.labs;
    store.questionBank = Array.isArray(data.questionBank) ? data.questionBank : [];
    store.settings = { ...defaultStore.settings, ...(data.settings || {}) };
    store.studentDirectory = Array.isArray(data.studentDirectory) ? data.studentDirectory : [];
    store.studentProgress = {
      ...defaultStore.studentProgress,
      ...(data.studentProgress || {}),
      history: Array.isArray(data.studentProgress?.history) ? data.studentProgress.history : [],
      gradeRecords: Array.isArray(data.studentProgress?.gradeRecords) ? data.studentProgress.gradeRecords : [],
      resourceProgress: data.studentProgress?.resourceProgress && typeof data.studentProgress.resourceProgress === "object" ? data.studentProgress.resourceProgress : {},
    };
    store.studentProgressByAccount = data.studentProgressByAccount && typeof data.studentProgressByAccount === "object" ? data.studentProgressByAccount : {};
    lastSyncedSnapshot = syncSnapshot(data);
    localStorage.setItem("cloudlab-local-data", JSON.stringify({ ...store, filters: undefined }));
    render();
    return true;
  } catch { return false; }
}

async function loadAdminRuntime() {
  if (!apiBase) {
    adminRuntime.loading = false;
    adminRuntime.errors = ["当前未通过 HTTP 服务运行，无法读取服务状态"];
    if (store.role === "admin") render();
    return;
  }
  const endpoints = [["health", "/health"], ["terminal", "/terminal/status"], ["cloud", "/cloud/adapter-status"], ["cluster", "/cluster/status"]];
  const results = await Promise.all(endpoints.map(async ([key, path]) => {
    try {
      const response = await fetch(`${apiBase}${path}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return [key, await response.json(), ""];
    } catch (error) {
      return [key, null, error.message || "请求失败"];
    }
  }));
  adminRuntime.errors = [];
  results.forEach(([key, value, error]) => {
    adminRuntime[key] = value;
    if (error) adminRuntime.errors.push(`${key}: ${error}`);
  });
  adminRuntime.loading = false;
  adminRuntime.checkedAt = new Date().toISOString();
  if (store.role === "admin") render();
}

const configs = {
  teacher: {
    label: "教师管理",
    identity: () => store.settings.teacherName ? `教师 · ${store.settings.teacherName}` : "教师",
    nav: [["home", "▦", "工作概览"], ["courses", "▤", "我的课程"], ["questions", "?", "题库与组卷"], ["labs", "◫", "实验模板"], ["grading", "✓", "评测与成绩"], ["settings", "⚙", "教学设置"]],
  },
  student: {
    label: "学生学习",
    identity: () => "学生",
    nav: [["home", "▦", "学习概览"], ["learning", "▤", "课程学习"], ["practice", "⌘", "实训与考试"], ["grades", "✓", "作业与成绩"], ["records", "◷", "学习记录"]],
  },
  admin: {
    label: "平台管理",
    identity: () => "管理员",
    nav: [["home", "▦", "资源概览"], ["resources", "▣", "云资源池"], ["users", "♙", "用户与权限"], ["settings", "⚙", "平台设置"]],
  },
};

function button(text, action, style = "primary", extra = "") {
  return `<button class="${style}" data-action="${action}" ${extra}>${text}</button>`;
}

function head(title, description, actions = "") {
  return `<div class="view-head"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="detail-actions">${actions}</div></div>`;
}

function tag(status) {
  const color = ["已发布", "进行中", "已完成", "已通过", "已公开", "平时成绩"].includes(status) ? "green" : ["草稿", "公开申请中"].includes(status) ? "amber" : ["待审核", "考试成绩"].includes(status) ? "blue" : "gray";
  return `<span class="tag ${color}">${esc(status || "草稿")}</span>`;
}

function gradeTypeLabel(value) {
  return value === "exam" ? "考试成绩" : "平时成绩";
}

function studentIdentity(accountId, course, gradeRecord = {}) {
  const directoryEntry = store.studentDirectory.find((item) => item.accountId === accountId);
  const member = course?.members?.find((item) => [item.accountId, item.id, item.identifier].filter(Boolean).includes(accountId))
    || store.courses.flatMap((item) => item.members || []).find((item) => [item.accountId, item.id, item.identifier].filter(Boolean).includes(accountId));
  const snapshot = String(gradeRecord.studentNameSnapshot || "").trim();
  const readableSnapshot = snapshot && snapshot !== "未知学生" ? snapshot : "";
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(accountId || ""));
  const name = directoryEntry?.name || readableSnapshot || member?.name || (!uuidLike && accountId ? accountId : "未知学生");
  const identifier = directoryEntry?.username || member?.identifier || member?.accountId || (uuidLike ? `账号尾号 ${String(accountId).slice(-4)}` : accountId || "账号未知");
  return { name, identifier };
}

function metrics(items) {
  return `<div class="metrics">${items.map(([label, value, note]) => `<article class="metric"><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}</div><div class="metric-note">${esc(note)}</div></article>`).join("")}</div>`;
}

function emptyState(title, text, action = "") {
  return `<section class="empty-state"><h2>${esc(title)}</h2><p>${esc(text)}</p>${action}</section>`;
}

function moduleLabel(id) {
  return moduleDefinitions.find(([key]) => key === id)?.[1] || id;
}

function renderNav() {
  const config = configs[store.role];
  $("#sideLabel").textContent = config.label;
  const identity = authState.user?.name || config.identity();
  $("#identityText").textContent = identity;
  $("#identityAvatar").textContent = identity.slice(0, 1);
  $("#sidebarNav").innerHTML = config.nav.map(([page, icon, label]) => {
    const nestedPage = (store.page === "course" && page === "courses") || (store.page === "student-course" && page === "learning");
    return `<button class="nav-item ${store.page === page || nestedPage ? "active" : ""}" data-page="${page}"><span class="nav-icon">${icon}</span>${label}</button>`;
  }).join("");
  document.querySelectorAll("[data-role]").forEach((item) => {
    item.classList.toggle("active", item.dataset.role === store.role);
    item.hidden = authState.authRequired && item.dataset.role !== store.role;
  });
  $("#roleSwitch").hidden = false;
  const status = $("#platformStatus");
  const healthy = String(adminRuntime.health?.status || "").toUpperCase() === "UP";
  status.classList.toggle("warning", !adminRuntime.loading && !healthy);
  status.innerHTML = `<span class="status-dot"></span>${adminRuntime.loading ? "正在检查平台服务" : healthy ? "平台服务正常" : "平台服务状态异常"}`;
}

function teacherHome() {
  const published = store.courses.filter((course) => course.status === "已发布").length;
  const stageCount = store.courses.reduce((sum, course) => sum + (course.stages?.length || 0), 0);
  const draftLabs = store.labs.filter((lab) => lab.state !== "已发布").length;
  const overview = metrics([
    ["课程总数", store.courses.length, "本账号创建的课程"],
    ["已发布课程", published, "可发送至教学课堂"],
    ["课程阶段", stageCount, "章节与教学内容"],
    ["实验模板", store.labs.length, `${draftLabs} 个草稿`],
  ]);
  const recent = store.courses.length
    ? `<section class="card"><div class="card-head"><h2>最近课程</h2><button class="link" data-page="courses">查看全部</button></div><table class="table"><thead><tr><th>课程</th><th>学期</th><th>阶段</th><th>状态</th><th></th></tr></thead><tbody>${store.courses.slice(0, 5).map(courseRow).join("")}</tbody></table></section>`
    : emptyState("还没有课程", "创建第一门课程后，可继续编排阶段、添加实验并发布到教学课堂。", button("创建课程", "new-course"));
  return head("教师工作概览", "从课程建设到课堂发布，数据均来自本地真实操作。", button("+ 创建课程", "new-course")) + overview + recent;
}

function courseRow(course) {
  return `<tr><td><span class="course-title">${esc(course.name)}</span><span class="subtext">${esc(course.code)}</span></td><td>${esc(course.term || "未设置")}</td><td>${course.stages?.length || 0}</td><td>${tag(course.status)}</td><td><button class="link" data-action="manage-course" data-id="${esc(course.id)}">管理</button></td></tr>`;
}

function coursesPage() {
  const query = store.filters.courseQuery.toLowerCase();
  const filtered = store.courses.filter((course) => {
    const matchQuery = !query || `${course.name} ${course.code}`.toLowerCase().includes(query);
    const matchStatus = store.filters.courseStatus === "全部" || course.status === store.filters.courseStatus;
    return matchQuery && matchStatus;
  });
  const content = store.courses.length
    ? `<div class="toolbar"><input id="courseSearch" value="${esc(store.filters.courseQuery)}" placeholder="搜索课程名称或编号" /><select id="courseStatusFilter"><option ${store.filters.courseStatus === "全部" ? "selected" : ""}>全部</option><option ${store.filters.courseStatus === "草稿" ? "selected" : ""}>草稿</option><option ${store.filters.courseStatus === "已发布" ? "selected" : ""}>已发布</option><option ${store.filters.courseStatus === "公开申请中" ? "selected" : ""}>公开申请中</option><option ${store.filters.courseStatus === "已公开" ? "selected" : ""}>已公开</option><option ${store.filters.courseStatus === "已归档" ? "selected" : ""}>已归档</option></select></div>${filtered.length ? `<section class="card"><table class="table"><thead><tr><th>课程</th><th>学期</th><th>阶段</th><th>状态</th><th></th></tr></thead><tbody>${filtered.map(courseRow).join("")}</tbody></table></section>` : emptyState("没有匹配的课程", "调整搜索词或状态筛选后重试。")}`
    : emptyState("课程列表为空", "创建课程时可设置基本信息、课堂模块、学期与访问权限。", button("创建第一门课程", "new-course"));
  return head("我的课程", "创建并管理实践课程、章节和教学模块。", button("+ 创建课程", "new-course")) + content;
}

function questionBankPage() {
  const rows = store.questionBank.map((question) => {
    const usedBy = store.courses.flatMap((course) => course.exams || []).filter((exam) => (exam.questionRefs || []).some((reference) => reference.questionId === question.id)).length;
    const course = store.courses.find((item) => item.id === question.courseId);
    return `<tr><td><b>${esc(question.stem)}</b><span class="subtext">${esc(question.tags?.join("、") || "未设置标签")}</span></td><td>${esc(question.type)}</td><td>${esc(question.difficulty)}</td><td>${esc(question.defaultScore || 0)} 分</td><td>${esc(course?.name || "公共题库")}</td><td>${usedBy} 份试卷</td><td><button class="link" data-action="edit-question" data-id="${esc(question.id)}">编辑</button><button class="link" data-action="duplicate-question" data-id="${esc(question.id)}">复制</button><button class="link text-danger" data-action="delete-question" data-id="${esc(question.id)}">删除</button></td></tr>`;
  }).join("");
  const types = new Set(store.questionBank.map((question) => question.type)).size;
  const used = new Set(store.courses.flatMap((course) => course.exams || []).flatMap((exam) => (exam.questionRefs || []).map((reference) => reference.questionId))).size;
  return head("题库与组卷", "教师创建的题目可跨考试重复使用，客观题由服务端自动判分。", button("+ 新建题目", "new-question")) +
    metrics([["题目总数", store.questionBank.length, "可复用题目"], ["题型", types, "选择、判断、填空、简答等"], ["已组卷题目", used, "正在被考试引用"], ["课程", store.courses.length, "可关联题目"]]) +
    `<section class="card"><table class="table"><thead><tr><th>题干</th><th>题型</th><th>难度</th><th>默认分值</th><th>所属课程</th><th>使用情况</th><th>操作</th></tr></thead><tbody>${rows || `<tr><td colspan="7"><div class="empty">题库为空。创建题目后，可在编辑考试时手动选题或随机组卷。</div></td></tr>`}</tbody></table></section>`;
}

function ensureCourseCollections(course) {
  for (const key of ["stages", "lectures", "resources", "members", "notices", "messages", "assignments", "assignmentGroups", "exams", "discussions", "discussionReplies", "knowledgePoints", "moduleItems", "submissions", "classrooms", "sections", "roleApplications", "surveys", "surveyResponses", "attendanceSessions", "attendanceRecords", "peerReviews", "gradeAppeals", "peerReviewTargets"]) {
    if (!Array.isArray(course[key])) course[key] = [];
  }
  return course;
}

function workspaceTabs(course) {
  const enabled = new Set(course.modules || []);
  const tabs = [["overview", "课堂概览"], ["plan", "教学计划"], ["members", "成员管理"], ["resources", "资源库"]];
  if (enabled.has("class")) tabs.push(["classes", "分班与申请"]);
  if (enabled.has("notice")) tabs.push(["notices", "通知公告"]);
  tabs.push(["messages", "站内消息"]);
  if (enabled.has("assignment") || enabled.has("programming") || enabled.has("group")) tabs.push(["assignments", "作业管理"]);
  if (enabled.has("exam")) tabs.push(["exams", "在线考试"]);
  if (enabled.has("assignment") || enabled.has("programming") || enabled.has("group") || enabled.has("exam")) tabs.push(["submissions", "批阅成绩"]);
  if (enabled.has("discussion")) tabs.push(["discussions", "互动讨论"]);
  if (enabled.has("survey")) tabs.push(["surveys", "问卷调查"]);
  if (enabled.has("attendance")) tabs.push(["attendance", "在线签到"]);
  if (enabled.has("knowledge-graph")) tabs.push(["knowledge", "知识管理"]);
  if (extensionModuleIds.some((id) => enabled.has(id))) tabs.push(["extensions", "扩展能力"]);
  tabs.push(["analytics", "教学统计"]);
  return tabs;
}

function stageRow(course, stage, index) {
  const lab = store.labs.find((item) => item.id === stage.labId);
  const resources = (stage.resourceIds || []).map((id) => course.resources.find((item) => item.id === id)).filter(Boolean);
  const resourceText = resources.length ? ` · ${resources.map((item) => item.name).join("、")}` : "";
  const contentState = String(stage.content || "").trim() ? " · 已填写具体学习内容" : " · 未填写具体学习内容";
  return `<div class="stage-item"><span class="stage-index">${index + 1}</span><div><strong>${esc(stage.name)}</strong><p>${esc(stage.type)} · ${esc(stage.description || "暂无说明")}${lab ? ` · 实验：${esc(lab.name)}` : ""}${esc(resourceText)}${esc(contentState)}</p></div><div class="stage-actions"><button class="link" data-action="edit-stage" data-course-id="${esc(course.id)}" data-stage-id="${esc(stage.id)}">编辑</button><button class="link" data-action="move-stage-up" data-course-id="${esc(course.id)}" data-stage-id="${esc(stage.id)}">↑</button><button class="link" data-action="move-stage-down" data-course-id="${esc(course.id)}" data-stage-id="${esc(stage.id)}">↓</button><button class="link text-danger" data-action="delete-stage" data-course-id="${esc(course.id)}" data-stage-id="${esc(stage.id)}">删除</button></div></div>`;
}

function courseOverviewPanel(course) {
  const readiness = courseReadiness(course);
  const modules = course.modules.length ? course.modules.map((id) => `<span class="module-pill">${esc(moduleLabel(id))}</span>`).join("") : `<span class="subtext">尚未启用课堂模块</span>`;
  return `<section class="card"><div class="card-head"><h2>课程信息</h2>${tag(course.status)}</div><div class="readiness-banner ${readiness.ready ? "ready" : "pending"}"><strong>${readiness.ready ? "发布资料已完整" : "发布前还需完善"}</strong><span>${readiness.ready ? "课程目标、课堂成员和教学内容均可继续运营。" : readiness.errors.map(esc).join("、")}</span></div><div class="course-summary"><div><span>课程分类</span><strong>${esc(course.category || "未设置")}</strong></div><div><span>难度</span><strong>${esc(course.difficulty || "未设置")}</strong></div><div><span>学期</span><strong>${esc(course.term || "未设置")}</strong></div><div><span>开课日期</span><strong>${esc(course.startDate || "未设置")}</strong></div><div><span>结束日期</span><strong>${esc(course.endDate || "未设置")}</strong></div><div><span>总学时</span><strong>${esc(course.totalHours || "未设置")}</strong></div><div><span>学分</span><strong>${esc(course.credits || "未设置")}</strong></div><div><span>适用对象</span><strong>${esc(course.targetAudience || "未设置")}</strong></div></div><div class="module-list"><span class="subtext full-line">课程目标</span><p class="full-line detail-copy">${esc(course.learningObjectives || "暂无课程目标")}</p><span class="subtext full-line">课程简介</span><p class="full-line detail-copy">${esc(course.summary || "暂无课程简介")}</p></div></section><div class="grid workspace-summary-grid"><section class="card"><div class="card-head"><h2>教学运行概况</h2></div>${metrics([["讲次", course.lectures.length, "教学计划"], ["阶段", course.stages.length, "学习环节"], ["资源", course.resources.length, "课程资源"], ["成员", course.members.length, "课堂成员"]])}</section><section class="card"><div class="card-head"><h2>已启用模块</h2></div><div class="module-list">${modules}</div></section></div><section class="card workspace-card"><div class="card-head"><h2>教学课堂</h2>${button("发送至课堂", "new-classroom", "secondary", `data-id="${esc(course.id)}"`)}</div>${course.classrooms.length ? `<div class="classroom-list">${course.classrooms.map((room) => `<div><strong>${esc(room.name)}</strong><span>邀请码：${esc(room.inviteCode || "未设置")} · ${esc(room.endDate || "未设置结束日期")}</span></div>`).join("")}</div>` : `<div class="empty">尚未创建教学课堂。</div>`}</section>`;
}

function teachingPlanPanel(course) {
  const grouped = course.lectures.map((lecture, lectureIndex) => {
    const stages = course.stages.filter((stage) => stage.lectureId === lecture.id);
    return `<section class="lecture-card"><header><div><span>讲次 ${String(lectureIndex + 1).padStart(2, "0")}</span><h2>${esc(lecture.name)}</h2><p>${esc(lecture.description || "暂无讲次说明")}${lecture.scheduledAt ? ` · ${esc(lecture.scheduledAt)}` : ""}</p></div><div class="stage-actions"><button class="link" data-action="new-stage" data-id="${esc(course.id)}" data-lecture-id="${esc(lecture.id)}">+ 添加阶段</button><button class="link" data-action="edit-lecture" data-course-id="${esc(course.id)}" data-lecture-id="${esc(lecture.id)}">编辑</button><button class="link" data-action="move-lecture-up" data-course-id="${esc(course.id)}" data-lecture-id="${esc(lecture.id)}">↑</button><button class="link" data-action="move-lecture-down" data-course-id="${esc(course.id)}" data-lecture-id="${esc(lecture.id)}">↓</button><button class="link text-danger" data-action="delete-lecture" data-course-id="${esc(course.id)}" data-lecture-id="${esc(lecture.id)}">删除</button></div></header><div class="stage-list">${stages.length ? stages.map((stage, index) => stageRow(course, stage, index)).join("") : `<div class="compact-empty">暂无阶段，可添加课前、课中或自定义学习环节。</div>`}</div></section>`;
  }).join("");
  const ungrouped = course.stages.filter((stage) => !stage.lectureId);
  return `<div class="workspace-toolbar"><div><h2>教学计划</h2><p>按讲次组织课前、课中和课后阶段，并绑定实验与教学资源。</p></div><div>${button("+ 添加讲次", "new-lecture", "secondary", `data-id="${esc(course.id)}"`)}${button("+ 添加阶段", "new-stage", "primary", `data-id="${esc(course.id)}"`)}</div></div>${grouped || emptyState("暂无教学讲次", "先创建讲次，再为讲次添加阶段和资源。", button("添加第一个讲次", "new-lecture", "secondary", `data-id="${esc(course.id)}"`))}${ungrouped.length ? `<section class="lecture-card ungrouped"><header><div><span>待整理</span><h2>未归入讲次的阶段</h2></div></header><div class="stage-list">${ungrouped.map((stage, index) => stageRow(course, stage, index)).join("")}</div></section>` : ""}`;
}

function membersPanel(course) {
  const roles = ["教师", "助教", "学生", "合作者"];
  const counts = roles.map((role) => [role, course.members.filter((item) => item.role === role).length, "课堂成员"]);
  const rows = course.members.map((member) => { const section = course.sections.find((item) => item.id === member.classId); return `<tr><td><b>${esc(member.name)}</b><span class="subtext">${esc(member.identifier || "未设置编号")}</span></td><td>${tag(member.role)}</td><td>${esc(section?.name || "未分班")}</td><td>${esc(member.email || "--")}</td><td>${esc(member.status || "正常")}</td><td><button class="link" data-action="edit-member" data-course-id="${esc(course.id)}" data-member-id="${esc(member.id)}">编辑</button><button class="link text-danger" data-action="delete-member" data-course-id="${esc(course.id)}" data-member-id="${esc(member.id)}">移除</button></td></tr>`; }).join("");
  return `<div class="workspace-toolbar"><div><h2>课堂成员与角色</h2><p>管理教师、助教、学生和合作者，可一次批量添加并分配班级。</p></div>${button("+ 添加成员", "new-member", "primary", `data-id="${esc(course.id)}"`)}</div>${metrics(counts)}<section class="card"><table class="table"><thead><tr><th>成员</th><th>角色</th><th>班级</th><th>邮箱</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows || `<tr><td colspan="6"><div class="empty">暂无课堂成员</div></td></tr>`}</tbody></table></section>`;
}

function classesPanel(course) {
  const sectionRows = course.sections.map((section) => `<tr><td><b>${esc(section.name)}</b><span class="subtext">${esc(section.code || "未设置班级编号")}</span></td><td>${course.members.filter((member) => member.classId === section.id).length}</td><td>${esc(section.teacherName || "未指定")}</td><td><button class="link" data-action="edit-section" data-course-id="${esc(course.id)}" data-section-id="${esc(section.id)}">编辑</button><button class="link text-danger" data-action="delete-section" data-course-id="${esc(course.id)}" data-section-id="${esc(section.id)}">删除</button></td></tr>`).join("");
  const applicationRows = course.roleApplications.map((application) => `<tr><td><b>${esc(application.name)}</b><span class="subtext">${esc(application.reason || "未填写申请说明")}</span></td><td>${esc(application.requestedRole)}</td><td>${tag(application.status)}</td><td>${application.status === "待审核" ? `<button class="link" data-action="review-role-application" data-course-id="${esc(course.id)}" data-application-id="${esc(application.id)}" data-decision="通过">通过</button><button class="link text-danger" data-action="review-role-application" data-course-id="${esc(course.id)}" data-application-id="${esc(application.id)}" data-decision="驳回">驳回</button>` : "--"}</td></tr>`).join("");
  return `<div class="workspace-toolbar"><div><h2>分班与角色申请</h2><p>建立教学班、分配学生，并审核教师或助教角色申请。</p></div>${button("+ 新建班级", "new-section", "primary", `data-id="${esc(course.id)}"`)}</div>${metrics([["教学班", course.sections.length, "课程内班级"], ["已分班", course.members.filter((member) => member.classId).length, "已有班级的成员"], ["待审核", course.roleApplications.filter((item) => item.status === "待审核").length, "角色申请"]])}<section class="card"><div class="card-head"><h2>教学班</h2></div><table class="table"><thead><tr><th>班级</th><th>人数</th><th>负责教师</th><th>操作</th></tr></thead><tbody>${sectionRows || `<tr><td colspan="4"><div class="empty">暂无教学班</div></td></tr>`}</tbody></table></section><section class="card workspace-card"><div class="card-head"><h2>角色申请</h2></div><table class="table"><thead><tr><th>申请人</th><th>申请角色</th><th>状态</th><th>操作</th></tr></thead><tbody>${applicationRows || `<tr><td colspan="4"><div class="empty">暂无角色申请</div></td></tr>`}</tbody></table></section>`;
}

function resourcesPanel(course) {
  const rows = course.resources.map((resource) => `<tr><td><b>${esc(resource.name)}</b><span class="subtext">${esc(resource.folder || "未分类")} · ${esc(resource.description || "暂无说明")}</span></td><td>${esc(resource.type)}</td><td>${esc(resource.versions?.length || (resource.url ? 1 : 0))} 个版本</td><td>${tag(resource.status || "草稿")}</td><td><button class="link" data-action="edit-resource" data-course-id="${esc(course.id)}" data-resource-id="${esc(resource.id)}">编辑</button>${resource.url ? `<a class="link" href="${esc(resource.url)}" target="_blank" rel="noopener">查看</a>` : ""}<button class="link" data-action="toggle-resource-publish" data-course-id="${esc(course.id)}" data-resource-id="${esc(resource.id)}">${resource.status === "已发布" ? "撤回" : "发布"}</button><button class="link text-danger" data-action="delete-resource" data-course-id="${esc(course.id)}" data-resource-id="${esc(resource.id)}">删除</button></td></tr>`).join("");
  return `<div class="workspace-toolbar"><div><h2>教学资源库</h2><p>上传课件和资料，按目录管理版本，也可使用外部学习链接。</p></div>${button("+ 新建资源", "new-resource", "primary", `data-id="${esc(course.id)}"`)}</div><section class="card"><table class="table"><thead><tr><th>资源</th><th>类型</th><th>版本</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows || `<tr><td colspan="5"><div class="empty">暂无教学资源</div></td></tr>`}</tbody></table></section>`;
}

const activityConfig = {
  notices: ["通知公告", "发布课程动态与重要提醒", "notice"],
  assignments: ["作业管理", "布置图文、编程或分组作业", "assignment"],
  exams: ["在线考试", "创建考试并设置时间与总分", "exam"],
  discussions: ["互动讨论", "发布课堂讨论话题", "discussion"],
};

function activitiesPanel(course, key) {
  const [title, description, kind] = activityConfig[key];
  const items = course[key];
  const rows = items.map((item) => { const replyCount = kind === "discussion" ? course.discussionReplies.filter((reply) => reply.discussionId === item.id).length : 0; return `<tr><td><b>${esc(item.title)}</b><span class="subtext">${esc(item.description || "暂无说明")}${kind === "discussion" ? ` · ${replyCount} 条回复` : ""}</span></td><td>${esc(item.type || title)}</td><td>${esc(item.dueAt || item.publishedAt || "未设置")}</td><td>${tag(item.status || "草稿")}</td><td><button class="link" data-action="edit-activity" data-course-id="${esc(course.id)}" data-kind="${kind}" data-item-id="${esc(item.id)}">编辑</button><button class="link" data-action="toggle-activity-publish" data-course-id="${esc(course.id)}" data-kind="${kind}" data-item-id="${esc(item.id)}">${item.status === "已发布" ? "撤回" : "发布"}</button><button class="link text-danger" data-action="delete-activity" data-course-id="${esc(course.id)}" data-kind="${kind}" data-item-id="${esc(item.id)}">删除</button></td></tr>`; }).join("");
  const groupRows = key === "assignments" ? course.assignmentGroups.map((group) => { const task = course.assignments.find((item) => item.id === group.assignmentId); return `<tr><td><b>${esc(group.name)}</b><span class="subtext">${esc((group.memberNames || []).join("、") || "尚未分配成员")}</span></td><td>${esc(task?.title || "已删除作业")}</td><td>${esc(group.memberIds?.length || 0)} / ${esc(task?.groupSize || "--")}</td><td><button class="link" data-action="edit-assignment-group" data-course-id="${esc(course.id)}" data-group-id="${esc(group.id)}">编辑</button><button class="link text-danger" data-action="delete-assignment-group" data-course-id="${esc(course.id)}" data-group-id="${esc(group.id)}">删除</button></td></tr>`; }).join("") : "";
  const groups = key === "assignments" && course.assignments.some((item) => item.type === "分组作业") ? `<section class="card workspace-card"><div class="card-head"><div><h2>分组作业小组</h2><span>为分组作业分配学生，组内共享提交与成绩。</span></div>${button("+ 新建小组", "new-assignment-group", "secondary", `data-id="${esc(course.id)}"`)}</div><table class="table"><thead><tr><th>小组</th><th>作业</th><th>人数</th><th>操作</th></tr></thead><tbody>${groupRows || `<tr><td colspan="4"><div class="empty">暂无作业小组</div></td></tr>`}</tbody></table></section>` : "";
  return `<div class="workspace-toolbar"><div><h2>${title}</h2><p>${description}</p></div>${button(`+ 新建${title}`, "new-activity", "primary", `data-id="${esc(course.id)}" data-kind="${kind}"`)}</div><section class="card"><table class="table"><thead><tr><th>标题</th><th>类型</th><th>时间</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows || `<tr><td colspan="5"><div class="empty">暂无${title}</div></td></tr>`}</tbody></table></section>${groups}`;
}

function messagesPanel(course) {
  const rows = course.messages.map((message) => `<tr><td><b>${esc(message.subject)}</b><span class="subtext">${esc(message.content)}</span></td><td>${esc(message.senderName)} → ${esc(message.recipientName)}</td><td>${esc(formatTime(message.createdAt))}</td></tr>`).join("");
  return `<div class="workspace-toolbar"><div><h2>站内消息</h2><p>向课堂成员发送定向通知，并保留师生沟通记录。</p></div>${button("+ 发送消息", "new-message", "primary", `data-id="${esc(course.id)}"`)}</div><section class="card"><table class="table"><thead><tr><th>主题与内容</th><th>发送关系</th><th>时间</th></tr></thead><tbody>${rows || `<tr><td colspan="3"><div class="empty">暂无站内消息</div></td></tr>`}</tbody></table></section>`;
}

function analyticsPanel(course) {
  const students = course.members.filter((item) => item.role === "学生").length;
  const progress = store.studentProgress;
  const resourceProgress = progress.resourceProgress && typeof progress.resourceProgress === "object" ? progress.resourceProgress : {};
  const completedResources = Object.values(resourceProgress).filter((item) => item.courseId === course.id && item.status === "已完成").length;
  const publishedResources = [course.resources, course.assignments, course.exams, course.discussions, course.moduleItems].flat().filter((item) => item.status === "已发布").length + course.stages.filter((item) => item.labId).length;
  const completionRate = publishedResources ? Math.round((completedResources / publishedResources) * 100) : 0;
  const publishedTasks = [...course.assignments, ...course.exams].filter((item) => item.status === "已发布");
  const attendanceSessions = course.attendanceSessions.filter((item) => item.status !== "草稿");
  const studentRows = course.members.filter((member) => member.role === "学生").map((member) => {
    const identities = new Set([member.accountId, member.id, member.identifier].filter(Boolean));
    const submissions = course.submissions.filter((item) => identities.has(item.studentId) || item.studentName === member.name);
    const graded = submissions.filter((item) => Number.isFinite(Number(item.score)));
    const average = graded.length ? Math.round(graded.reduce((sum, item) => sum + Number(item.score), 0) / graded.length * 10) / 10 : null;
    const attendance = course.attendanceRecords.filter((item) => identities.has(item.studentId) || item.studentName === member.name).length;
    const reviews = course.peerReviews.filter((item) => identities.has(item.reviewerId)).length;
    const section = course.sections.find((item) => item.id === member.classId);
    return { member, section: section?.name || "未分班", submitted: new Set(submissions.map((item) => item.activityId)).size, average, attendance, reviews };
  });
  const rows = studentRows.map((row) => `<tr><td><b>${esc(row.member.name)}</b><span class="subtext">${esc(row.member.identifier || row.member.accountId || row.member.id)}</span></td><td>${esc(row.section)}</td><td>${row.submitted} / ${publishedTasks.length}</td><td>${row.average == null ? "--" : row.average}</td><td>${row.attendance} / ${attendanceSessions.length}</td><td>${row.reviews}</td></tr>`).join("");
  const sectionCards = course.sections.map((section) => { const members = studentRows.filter((row) => row.member.classId === section.id); const submitted = members.reduce((sum, row) => sum + row.submitted, 0); const expected = members.length * publishedTasks.length; return `<article class="module-tool-card"><div><span>教学班</span><h3>${esc(section.name)}</h3><p>${members.length} 名学生 · 作业提交率 ${expected ? Math.round(submitted / expected * 100) : 0}%</p></div><strong>${members.filter((row) => row.average != null).length}<small>已有成绩</small></strong></article>`; }).join("");
  return `<div class="workspace-toolbar"><div><h2>教学统计</h2><p>按学生和教学班汇总真实提交、成绩、签到与互评数据。</p></div>${button("导出学情 CSV", "export-learning-analytics", "secondary", `data-id="${esc(course.id)}"`)}</div>${metrics([["学生", students, "课堂学生数"], ["已发布任务", publishedTasks.length, "作业与考试"], ["学生提交", course.submissions.length, "真实提交记录"], ["签到记录", course.attendanceRecords.length, `${attendanceSessions.length} 次签到`]])}${sectionCards ? `<section class="module-tools-grid">${sectionCards}</section>` : ""}<section class="card workspace-card"><div class="card-head"><h2>学生学情明细</h2></div><table class="table"><thead><tr><th>学生</th><th>班级</th><th>任务提交</th><th>平均分</th><th>签到</th><th>互评</th></tr></thead><tbody>${rows || `<tr><td colspan="6"><div class="empty">暂无学生成员</div></td></tr>`}</tbody></table></section><div class="grid"><section class="card"><div class="card-head"><h2>实验评测概览</h2></div><div class="course-summary"><div><span>正式评测次数</span><strong>${esc(progress.attempts || 0)}</strong></div><div><span>最高成绩</span><strong>${esc(progress.score ?? "--")}</strong></div><div><span>学习状态</span><strong>${esc(progress.status)}</strong></div><div><span>最近活动</span><strong>${esc(formatTime(progress.lastActivityAt))}</strong></div></div></section><section class="card"><div class="card-head"><h2>资源完成概览</h2></div><div class="course-summary"><div><span>已发布资源</span><strong>${publishedResources}</strong></div><div><span>完成资源</span><strong>${completedResources}</strong></div><div><span>完成率</span><strong>${completionRate}%</strong></div></div></section></div>`;
}

function submissionsPanel(course) {
  const tasks = [...course.assignments, ...course.exams];
  const rows = course.submissions.map((submission) => {
    const task = tasks.find((item) => item.id === submission.activityId);
    const risk = Number(submission.similarity || 0) >= 70 ? `高相似 ${submission.similarity}%` : submission.similarity ? `相似 ${submission.similarity}%` : "--";
    return `<tr><td><b>${esc(submission.studentName || "当前学生")}</b><span class="subtext">${esc(submission.studentId || "student-current")}</span></td><td><b>${esc(task?.title || "已删除任务")}</b><span class="subtext">${esc(submission.kind === "exam" ? "考试" : "作业")} · 第 ${esc(submission.attemptCount || 1)} 次</span></td><td>${tag(submission.status || "已提交")}</td><td>${submission.score == null ? "--" : `${esc(submission.score)} / ${esc(task?.totalScore || 100)}`}</td><td>${esc(risk)}</td><td>${esc(formatTime(submission.submittedAt))}</td><td><button class="link" data-action="grade-submission" data-course-id="${esc(course.id)}" data-submission-id="${esc(submission.id)}">${submission.status === "已批阅" ? "调整成绩" : "批阅"}</button><button class="link" data-action="return-submission" data-course-id="${esc(course.id)}" data-submission-id="${esc(submission.id)}">退回重做</button></td></tr>`;
  }).join("");
  const graded = course.submissions.filter((item) => item.status === "已批阅").length;
  const appealRows = course.gradeAppeals.map((appeal) => { const submission = course.submissions.find((item) => item.id === appeal.submissionId); const task = tasks.find((item) => item.id === appeal.activityId); return `<tr><td><b>${esc(appeal.studentName)}</b><span class="subtext">${esc(task?.title || "已删除任务")}</span></td><td>${esc(appeal.originalScore ?? submission?.score ?? "--")}</td><td>${esc(appeal.reason)}</td><td>${tag(appeal.status)}</td><td>${appeal.status === "待处理" ? `<button class="link" data-action="resolve-grade-appeal" data-course-id="${esc(course.id)}" data-appeal-id="${esc(appeal.id)}">处理</button>` : esc(appeal.response || "--")}</td></tr>`; }).join("");
  return `<div class="workspace-toolbar"><div><h2>提交批阅与成绩</h2><p>批阅、退回、调整成绩、查看相似度并导出真实提交记录。</p></div>${button("导出成绩 CSV", "export-grades", "secondary", `data-id="${esc(course.id)}"`)}</div>${metrics([["已发布任务", tasks.filter((item) => item.status === "已发布").length, "作业与考试"], ["学生提交", course.submissions.length, "真实提交记录"], ["已批阅", graded, "已给出成绩"], ["待处理申诉", course.gradeAppeals.filter((item) => item.status === "待处理").length, `互评 ${course.peerReviews.length} 条`]])}<section class="card"><table class="table"><thead><tr><th>学生</th><th>任务</th><th>状态</th><th>成绩</th><th>相似度</th><th>提交时间</th><th>操作</th></tr></thead><tbody>${rows || `<tr><td colspan="7"><div class="empty">暂无学生提交</div></td></tr>`}</tbody></table></section><section class="card workspace-card"><div class="card-head"><h2>成绩申诉</h2></div><table class="table"><thead><tr><th>学生/任务</th><th>原成绩</th><th>理由</th><th>状态</th><th>处理</th></tr></thead><tbody>${appealRows || `<tr><td colspan="5"><div class="empty">暂无成绩申诉</div></td></tr>`}</tbody></table></section>`;
}

function knowledgePanel(course) {
  const cards = course.knowledgePoints.map((point, index) => {
    const prerequisite = course.knowledgePoints.find((item) => item.id === point.prerequisiteId);
    const linkedStages = course.stages.filter((stage) => (stage.knowledgePointIds || []).includes(point.id));
    return `<article class="knowledge-card"><span class="knowledge-index">${String(index + 1).padStart(2, "0")}</span><div><b>${esc(point.name)}</b><small>${esc(point.code || "未设置编号")}</small><p>${esc(point.description || "暂无知识点说明")}</p><div><span>前置：${esc(prerequisite?.name || "无")}</span><span>关联阶段：${linkedStages.length}</span></div></div><div><button class="link" data-action="edit-knowledge" data-course-id="${esc(course.id)}" data-knowledge-id="${esc(point.id)}">编辑</button><button class="link text-danger" data-action="delete-knowledge" data-course-id="${esc(course.id)}" data-knowledge-id="${esc(point.id)}">删除</button></div></article>`;
  }).join("");
  return `<div class="workspace-toolbar"><div><h2>知识点与知识图谱</h2><p>定义课程知识点、前置关系，并关联到教学阶段形成学习路径。</p></div>${button("+ 新建知识点", "new-knowledge", "primary", `data-id="${esc(course.id)}"`)}</div><section class="knowledge-graph-card">${cards || `<div class="empty">暂无知识点，创建后可在阶段中关联。</div>`}</section>`;
}

function surveyQuestionRow(question = {}, index = 0) {
  return `<div class="config-row survey-question-row" data-question-id="${esc(question.id || uid("survey-question"))}"><div class="form-row"><label>题型</label><select name="surveyQuestionType"><option ${selected(question.type || "单选题", "单选题")}>单选题</option><option ${selected(question.type, "多选题")}>多选题</option><option ${selected(question.type, "文本题")}>文本题</option><option ${selected(question.type, "评分题")}>评分题</option></select></div><div class="form-row"><label>题目 ${index + 1}</label><input name="surveyQuestionTitle" required maxlength="500" value="${esc(question.title)}" /></div><div class="form-row full"><label>选项（每行一项）</label><textarea name="surveyQuestionOptions" maxlength="3000" placeholder="非常满意&#10;满意&#10;一般&#10;不满意">${esc((question.options || []).join("\n"))}</textarea></div><label class="check-option compact"><input type="checkbox" name="surveyQuestionRequired" ${checked(question.required !== false)} /><span>必答</span></label><button type="button" class="link text-danger" data-action="remove-survey-question">删除题目</button></div>`;
}

function surveyForm(courseId, survey = {}) {
  const questions = Array.isArray(survey.questions) && survey.questions.length ? survey.questions : [{ type: "单选题", title: "", options: ["非常满意", "满意", "一般", "不满意"], required: true }];
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="surveyId" value="${esc(survey.id)}" /><div class="form-grid"><div class="form-row full"><label>问卷标题 *</label><input name="title" required maxlength="120" value="${esc(survey.title)}" /></div><div class="form-row"><label>开放时间</label><input type="datetime-local" name="startAt" value="${esc(survey.startAt)}" /></div><div class="form-row"><label>截止时间</label><input type="datetime-local" name="dueAt" value="${esc(survey.dueAt)}" /></div><label class="check-option compact"><input type="checkbox" name="anonymous" ${checked(survey.anonymous)} /><span>匿名收集</span></label><label class="check-option compact"><input type="checkbox" name="allowResubmit" ${checked(survey.allowResubmit)} /><span>允许修改提交</span></label><div class="form-row full"><label>问卷说明</label><textarea name="description" maxlength="2000">${esc(survey.description)}</textarea></div><div class="form-section"><div class="section-title-row"><div><h3>问卷题目</h3><p>支持单选、多选、文本和 1–5 分评分题。</p></div><button type="button" class="secondary" data-action="add-survey-question">+ 添加题目</button></div><div id="surveyQuestionList" class="config-list">${questions.map(surveyQuestionRow).join("")}</div></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存问卷</button></div>`;
}

function surveyResponseForm(courseId, surveyId) {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  const survey = course.surveys.find((item) => item.id === surveyId) || {};
  const existing = course.surveyResponses.find((item) => item.surveyId === surveyId && item.studentId === currentStudentId()) || {};
  const answers = existing.answers || {};
  const fields = (survey.questions || []).map((question, index) => {
    const values = new Set(Array.isArray(answers[question.id]) ? answers[question.id] : [answers[question.id]].filter(Boolean));
    const required = question.required !== false ? "required" : "";
    if (question.type === "单选题") return `<div class="form-section"><h3>${index + 1}. ${esc(question.title)}${question.required !== false ? " *" : ""}</h3><div class="check-grid">${(question.options || []).map((option, optionIndex) => `<label class="check-option"><input type="radio" name="survey-answer-${esc(question.id)}" value="${esc(option)}" ${checked(values.has(option))} ${optionIndex === 0 ? required : ""} /><span>${esc(option)}</span></label>`).join("")}</div></div>`;
    if (question.type === "多选题") return `<div class="form-section"><h3>${index + 1}. ${esc(question.title)}${question.required !== false ? " *" : ""}</h3><div class="check-grid">${(question.options || []).map((option) => `<label class="check-option"><input type="checkbox" name="survey-answer-${esc(question.id)}" value="${esc(option)}" ${checked(values.has(option))} /><span>${esc(option)}</span></label>`).join("")}</div></div>`;
    if (question.type === "评分题") return `<div class="form-section"><h3>${index + 1}. ${esc(question.title)}${question.required !== false ? " *" : ""}</h3><select name="survey-answer-${esc(question.id)}" ${required}><option value="">请选择</option>${[1, 2, 3, 4, 5].map((value) => `<option ${selected(String(answers[question.id] || ""), String(value))}>${value}</option>`).join("")}</select></div>`;
    return `<div class="form-section"><h3>${index + 1}. ${esc(question.title)}${question.required !== false ? " *" : ""}</h3><textarea name="survey-answer-${esc(question.id)}" maxlength="5000" ${required}>${esc(answers[question.id] || "")}</textarea></div>`;
  }).join("");
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="surveyId" value="${esc(surveyId)}" /><div class="form-grid"><div class="form-section first"><h3>${esc(survey.title)}</h3><p>${esc(survey.description || "请如实填写问卷。")}</p></div>${fields}</div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">${existing.id ? "更新提交" : "提交问卷"}</button></div>`;
}

function discussionReplyForm(courseId, discussionId) {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  const discussion = course.discussions.find((item) => item.id === discussionId) || {};
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="discussionId" value="${esc(discussionId)}" /><div class="form-grid"><div class="form-section first"><h3>${esc(discussion.title || "课堂讨论")}</h3><p>${esc(discussion.description || "请发表与课程相关的观点。")}</p></div><div class="form-row full"><label>回复内容 *</label><textarea name="content" required maxlength="5000" placeholder="请输入观点、问题或学习心得"></textarea></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">发布回复</button></div>`;
}

function peerReviewForm(courseId, submissionId) {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  const target = course.peerReviewTargets.find((item) => item.id === submissionId) || {};
  const task = course.assignments.find((item) => item.id === target.activityId) || {};
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="submissionId" value="${esc(submissionId)}" /><div class="form-grid"><div class="form-section first"><h3>${esc(task.title || "作业互评")}</h3><p>${esc(target.studentName || "同学")} · 提交于 ${esc(formatTime(target.submittedAt))}</p></div><div class="form-section"><h3>作业内容</h3><p class="submission-content">${esc(target.content || "未填写文字内容")}</p>${target.attachmentUrl ? `<a href="${esc(target.attachmentUrl)}" target="_blank" rel="noopener">查看作品附件</a>` : ""}</div><div class="form-row"><label>互评分数 *</label><input type="number" name="score" required min="0" max="${esc(task.totalScore || 100)}" /></div><div class="form-row"><label>任务满分</label><input value="${esc(task.totalScore || 100)}" disabled /></div><div class="form-row full"><label>互评意见 *</label><textarea name="comment" required maxlength="3000" placeholder="请说明优点、问题和改进建议"></textarea></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">提交互评</button></div>`;
}

function gradeAppealForm(courseId, submissionId) {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  const submission = course.submissions.find((item) => item.id === submissionId) || {};
  const task = [...course.assignments, ...course.exams].find((item) => item.id === submission.activityId) || {};
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="submissionId" value="${esc(submissionId)}" /><div class="form-grid"><div class="form-section first"><h3>${esc(task.title || "成绩申诉")}</h3><p>当前成绩：${esc(submission.score ?? "--")} / ${esc(task.totalScore || 100)}；教师反馈：${esc(submission.feedback || "暂无")}</p></div><div class="form-row full"><label>申诉理由 *</label><textarea name="reason" required maxlength="3000" placeholder="请具体说明需要复核的评分项及理由"></textarea></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">提交申诉</button></div>`;
}

function resolveAppealForm(courseId, appealId) {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  const appeal = course.gradeAppeals.find((item) => item.id === appealId) || {};
  const submission = course.submissions.find((item) => item.id === appeal.submissionId) || {};
  const task = [...course.assignments, ...course.exams].find((item) => item.id === submission.activityId) || {};
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="appealId" value="${esc(appealId)}" /><div class="form-grid"><div class="form-section first"><h3>${esc(appeal.studentName || "学生")}的成绩申诉</h3><p>${esc(appeal.reason || "")}</p></div><div class="form-row"><label>处理结果</label><select name="decision"><option>通过</option><option>驳回</option></select></div><div class="form-row"><label>复核后成绩</label><input type="number" name="newScore" min="0" max="${esc(task.totalScore || 100)}" value="${esc(submission.score ?? "")}" /></div><div class="form-row full"><label>处理说明 *</label><textarea name="response" required maxlength="3000"></textarea></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存处理结果</button></div>`;
}

function surveyStatistics(course, survey) {
  const responses = course.surveyResponses.filter((item) => item.surveyId === survey.id);
  const details = (survey.questions || []).map((question) => {
    if (question.type === "文本题") return `<article><b>${esc(question.title)}</b><p>${responses.map((response) => response.answers?.[question.id]).filter(Boolean).slice(0, 5).map((answer) => esc(answer)).join("；") || "暂无回答"}</p></article>`;
    const options = question.type === "评分题" ? ["1", "2", "3", "4", "5"] : question.options || [];
    const counts = options.map((option) => [option, responses.filter((response) => (Array.isArray(response.answers?.[question.id]) ? response.answers[question.id] : [response.answers?.[question.id]]).includes(option)).length]);
    return `<article><b>${esc(question.title)}</b><p>${counts.map(([option, count]) => `${esc(option)}：${count}`).join(" · ") || "暂无回答"}</p></article>`;
  }).join("");
  return `<div class="module-list">${details || `<span class="subtext">暂无题目统计</span>`}</div>`;
}

function surveysPanel(course) {
  const rows = course.surveys.map((survey) => { const responses = course.surveyResponses.filter((item) => item.surveyId === survey.id); return `<section class="card workspace-card"><div class="card-head"><div><h2>${esc(survey.title)}</h2><span>${esc(survey.questions?.length || 0)} 题 · ${responses.length} 份提交 · ${survey.anonymous ? "匿名" : "实名"}</span></div>${tag(survey.status || "草稿")}</div>${surveyStatistics(course, survey)}<div class="button-row"><button class="link" data-action="edit-survey" data-course-id="${esc(course.id)}" data-survey-id="${esc(survey.id)}">编辑</button><button class="link" data-action="toggle-survey-publish" data-course-id="${esc(course.id)}" data-survey-id="${esc(survey.id)}">${survey.status === "已发布" ? "关闭" : "发布"}</button><button class="link text-danger" data-action="delete-survey" data-course-id="${esc(course.id)}" data-survey-id="${esc(survey.id)}">删除</button></div></section>`; }).join("");
  return `<div class="workspace-toolbar"><div><h2>问卷调查</h2><p>创建原生问卷、收集学生反馈并查看实时统计。</p></div>${button("+ 新建问卷", "new-survey", "primary", `data-id="${esc(course.id)}"`)}</div>${rows || emptyState("暂无问卷", "创建课程反馈、教学调查或学习情况问卷。", button("新建问卷", "new-survey", "secondary", `data-id="${esc(course.id)}"`))}`;
}

function attendanceForm(courseId, session = {}) {
  const defaultCode = String(Math.floor(100000 + Math.random() * 900000));
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="sessionId" value="${esc(session.id)}" /><div class="form-grid"><div class="form-row full"><label>签到名称 *</label><input name="title" required maxlength="120" value="${esc(session.title || "课堂签到")}" /></div><div class="form-row"><label>签到码 *</label><input name="code" required pattern="[A-Za-z0-9]{4,12}" maxlength="12" value="${esc(session.code || defaultCode)}" /></div><div class="form-row"><label>签到时长（分钟）</label><input type="number" name="durationMinutes" min="1" max="1440" value="${esc(session.durationMinutes || 10)}" /></div><div class="form-row"><label>计划开始时间</label><input type="datetime-local" name="scheduledAt" value="${esc(session.scheduledAt)}" /></div><div class="form-row"><label>签到范围</label><select name="sectionId"><option value="">全部学生</option>${ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {}).sections.map((section) => `<option value="${esc(section.id)}" ${selected(session.sectionId, section.id)}>${esc(section.name)}</option>`).join("")}</select></div><div class="form-row full"><label>说明</label><textarea name="description" maxlength="1000">${esc(session.description)}</textarea></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存签到</button></div>`;
}

function attendanceCheckInForm(courseId, sessionId) {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  const session = course.attendanceSessions.find((item) => item.id === sessionId) || {};
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="sessionId" value="${esc(sessionId)}" /><div class="form-grid"><div class="form-section first"><h3>${esc(session.title || "课堂签到")}</h3><p>${esc(session.description || "请输入教师提供的签到码。")}</p></div><div class="form-row full"><label>签到码 *</label><input name="code" required maxlength="12" autocomplete="one-time-code" placeholder="请输入签到码" /></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">确认签到</button></div>`;
}

function attendancePanel(course) {
  const studentCount = course.members.filter((member) => member.role === "学生").length;
  const cards = course.attendanceSessions.map((session) => {
    const records = course.attendanceRecords.filter((record) => record.sessionId === session.id);
    const targetCount = session.sectionId ? course.members.filter((member) => member.role === "学生" && member.classId === session.sectionId).length : studentCount;
    const names = records.map((record) => `${record.studentName}${record.late ? "（迟到）" : ""}`).join("、");
    const actions = session.status === "进行中" ? `<button class="link" data-action="change-attendance-status" data-course-id="${esc(course.id)}" data-session-id="${esc(session.id)}" data-status="已结束">结束签到</button>` : session.status === "草稿" ? `<button class="link" data-action="change-attendance-status" data-course-id="${esc(course.id)}" data-session-id="${esc(session.id)}" data-status="进行中">开始签到</button>` : `<button class="link" data-action="change-attendance-status" data-course-id="${esc(course.id)}" data-session-id="${esc(session.id)}" data-status="进行中">重新开始</button>`;
    return `<section class="card workspace-card"><div class="card-head"><div><h2>${esc(session.title)}</h2><span>${esc(session.scheduledAt || "未设置计划时间")} · 签到码 ${esc(session.code)}</span></div>${tag(session.status || "草稿")}</div>${metrics([["已签到", records.length, `应到 ${targetCount} 人`], ["出勤率", `${targetCount ? Math.round(records.length / targetCount * 100) : 0}%`, "实时统计"], ["迟到", records.filter((record) => record.late).length, "超过签到时限"]])}<p class="detail-copy">${esc(names || "暂无学生签到")}</p><div class="button-row"><button class="link" data-action="edit-attendance" data-course-id="${esc(course.id)}" data-session-id="${esc(session.id)}">编辑</button>${actions}<button class="link text-danger" data-action="delete-attendance" data-course-id="${esc(course.id)}" data-session-id="${esc(session.id)}">删除</button></div></section>`;
  }).join("");
  return `<div class="workspace-toolbar"><div><h2>在线签到</h2><p>创建课堂签到、控制有效时间，并查看实时出勤明细。</p></div>${button("+ 新建签到", "new-attendance", "primary", `data-id="${esc(course.id)}"`)}</div>${cards || emptyState("暂无签到", "创建签到后开始，学生可使用签到码完成签到。", button("新建签到", "new-attendance", "secondary", `data-id="${esc(course.id)}"`))}`;
}

function moduleToolsPanel(course) {
  const enabled = extensionModuleIds.filter((id) => course.modules.includes(id));
  const cards = enabled.map((id) => {
    const items = course.moduleItems.filter((item) => item.moduleId === id);
    const published = items.filter((item) => item.status === "已发布").length;
    return `<article class="module-tool-card"><div><span>${esc(moduleCategory(id))}</span><h3>${esc(moduleLabel(id))}</h3><p>${esc(moduleDefinitions.find(([key]) => key === id)?.[2] || "课堂扩展能力")}</p></div><strong>${published}/${items.length}<small>已发布/全部</small></strong>${button("新建内容", "new-module-item", "secondary", `data-id="${esc(course.id)}" data-module-id="${esc(id)}"`)}</article>`;
  }).join("");
  const rows = course.moduleItems.filter((item) => enabled.includes(item.moduleId)).map((item) => `<tr><td><b>${esc(item.title)}</b><span class="subtext">${esc(item.description || "暂无说明")}</span></td><td>${esc(moduleLabel(item.moduleId))}</td><td>${esc(item.scheduledAt || "未设置")}</td><td>${tag(item.status || "草稿")}</td><td><button class="link" data-action="edit-module-item" data-course-id="${esc(course.id)}" data-item-id="${esc(item.id)}">编辑</button><button class="link" data-action="toggle-module-item-publish" data-course-id="${esc(course.id)}" data-item-id="${esc(item.id)}">${item.status === "已发布" ? "撤回" : "发布"}</button><button class="link text-danger" data-action="delete-module-item" data-course-id="${esc(course.id)}" data-item-id="${esc(item.id)}">删除</button></td></tr>`).join("");
  return `<div class="workspace-toolbar"><div><h2>课堂扩展能力</h2><p>为已启用的备课、问卷、签到、直播、毕业设计、工程认证和 AI 模块配置实际内容。</p></div></div><section class="module-tools-grid">${cards}</section><section class="card workspace-card"><table class="table"><thead><tr><th>内容</th><th>模块</th><th>时间</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows || `<tr><td colspan="5"><div class="empty">暂无扩展模块内容</div></td></tr>`}</tbody></table></section>`;
}

function courseWorkspacePanel(course, tab) {
  if (tab === "plan") return teachingPlanPanel(course);
  if (tab === "members") return membersPanel(course);
  if (tab === "classes") return classesPanel(course);
  if (tab === "resources") return resourcesPanel(course);
  if (tab === "notices") return activitiesPanel(course, "notices");
  if (tab === "messages") return messagesPanel(course);
  if (tab === "assignments") return activitiesPanel(course, "assignments");
  if (tab === "exams") return activitiesPanel(course, "exams");
  if (tab === "submissions") return submissionsPanel(course);
  if (tab === "discussions") return activitiesPanel(course, "discussions");
  if (tab === "surveys") return surveysPanel(course);
  if (tab === "attendance") return attendancePanel(course);
  if (tab === "knowledge") return knowledgePanel(course);
  if (tab === "extensions") return moduleToolsPanel(course);
  if (tab === "analytics") return analyticsPanel(course);
  return courseOverviewPanel(course);
}

function courseDetail() {
  const course = store.courses.find((item) => item.id === store.selectedCourseId);
  if (!course) {
    store.page = "courses";
    return coursesPage();
  }
  ensureCourseCollections(course);
  const allowedTabs = workspaceTabs(course);
  const requestedTab = store.filters.courseWorkspaceTab || "overview";
  const tab = allowedTabs.some(([id]) => id === requestedTab) ? requestedTab : "overview";
  const publishAction = course.status === "草稿" ? button("申请发布", "toggle-course-publish", "primary", `data-id="${esc(course.id)}"`) : course.status === "已发布" ? button("申请公开", "request-public", "primary", `data-id="${esc(course.id)}"`) : course.status === "公开申请中" ? button("撤回公开申请", "request-public", "secondary", `data-id="${esc(course.id)}"`) : course.status === "已公开" ? button("归档课程", "archive-course", "secondary", `data-id="${esc(course.id)}"`) : course.status === "已归档" ? button("恢复课程", "archive-course", "secondary", `data-id="${esc(course.id)}"`) : button("撤回发布", "toggle-course-publish", "secondary", `data-id="${esc(course.id)}"`);
  const actions = `<button class="secondary" data-action="back-courses">返回课程</button>${button("编辑课程", "edit-course", "secondary", `data-id="${esc(course.id)}"`)}${button("发送至课堂", "new-classroom", "secondary", `data-id="${esc(course.id)}"`)}${publishAction}`;
  const tabs = `<nav class="teacher-workspace-tabs">${allowedTabs.map(([id, label]) => `<button class="${tab === id ? "active" : ""}" data-action="course-workspace-tab" data-tab="${id}">${label}</button>`).join("")}</nav>`;
  return head(course.name, `${course.code} · ${course.status}`, actions) + tabs + `<div class="teacher-workspace-panel">${courseWorkspacePanel(course, tab)}</div><div class="card workspace-card"><div class="card-head"><h2>课程操作</h2></div><div class="module-list"><button class="secondary" data-action="duplicate-course" data-id="${esc(course.id)}">复制课程</button><button class="danger" data-action="delete-course" data-id="${esc(course.id)}">删除课程</button></div></div>`;
}

function labsPage() {
  if (!store.labs.length) return head("实验模板", "为课程阶段创建可复用的实验内容。", button("+ 新建实验模板", "new-lab")) + emptyState("暂无实验模板", "实验模板包含操作模式、时长、任务说明与发布状态。", button("新建实验模板", "new-lab"));
  return head("实验模板", "配置实验目标、关卡内容、通过标准与安全自动评测。", button("+ 新建实验模板", "new-lab")) + `<section class="card"><table class="table"><thead><tr><th>实验名称</th><th>操作模式</th><th>通过标准</th><th>完整度</th><th>状态</th><th></th></tr></thead><tbody>${store.labs.map((lab) => { const readiness = labReadiness(lab); const evaluation = normalizedEvaluation(lab); return `<tr><td><span class="course-title">${esc(lab.name)}</span><span class="subtext">${esc(lab.objectives || lab.description || "暂无目标")}</span></td><td>${esc(lab.mode)}</td><td>${evaluation.passPolicy === "score-threshold" ? `${esc(evaluation.passingScore)} 分及格` : "必做测试全部通过"}</td><td><span class="readiness-dot ${readiness.ready ? "ready" : "pending"}">${readiness.ready ? "完整" : `缺 ${readiness.errors.length} 项`}</span></td><td>${tag(lab.state)}</td><td><div class="button-row"><button class="link" data-action="edit-lab" data-id="${esc(lab.id)}">编辑</button><button class="link" data-action="simulate-lab" data-id="${esc(lab.id)}">模拟实战</button><button class="link" data-action="toggle-lab-publish" data-id="${esc(lab.id)}">${lab.state === "已发布" ? "撤回" : "发布"}</button><button class="link text-danger" data-action="delete-lab" data-id="${esc(lab.id)}">删除</button></div></td></tr>`; }).join("")}</tbody></table></section>`;
}

function gradingPage() {
  const accountProgress = store.studentProgressByAccount && Object.keys(store.studentProgressByAccount).length
    ? Object.entries(store.studentProgressByAccount)
    : [["student-current", store.studentProgress]];
  const progressRows = accountProgress.flatMap(([accountId, progress]) => {
    const records = Array.isArray(progress?.gradeRecords) && progress.gradeRecords.length
      ? progress.gradeRecords
      : Object.values(progress?.resourceProgress || {}).filter((entry) => entry?.labId && entry.checkpointId).map((entry) => {
          const legacyCourse = store.courses.find((item) => item.id === entry.courseId) || store.courses.find((item) => (item.stages || []).some((stage) => stage.labId === entry.labId));
          const legacySubmission = legacyCourse?.submissions?.find((item) => item.labId === entry.labId && item.checkpointId === entry.checkpointId && item.studentId === accountId);
          const legacyExam = legacySubmission && legacyCourse.exams?.find((item) => item.id === legacySubmission.activityId);
          return { ...entry, gradeType: entry.gradeType || (entry.examId || legacySubmission ? "exam" : "regular"), examId: entry.examId || legacySubmission?.activityId || "", score: legacySubmission?.score ?? entry.score, maxScore: legacyExam?.totalScore || 100, passed: entry.status === "已完成", at: entry.completedAt || entry.lastActivityAt };
        });
    return records.map((entry) => {
      const course = store.courses.find((item) => item.id === entry.courseId) || store.courses.find((item) => (item.stages || []).some((stage) => stage.labId === entry.labId));
      const lab = store.labs.find((item) => item.id === entry.labId);
      const checkpoint = lab && normalizedCheckpoints(lab).find((item) => item.id === entry.checkpointId);
      return { accountId, identity: studentIdentity(accountId, course, entry), course, lab, checkpoint, entry };
    });
  }).sort((a, b) => String(b.entry.at || b.entry.completedAt || b.entry.lastActivityAt || "").localeCompare(String(a.entry.at || a.entry.completedAt || a.entry.lastActivityAt || "")));
  const rows = progressRows.map(({ identity, course, lab, checkpoint, entry }) => `<tr><td><b>${esc(identity.name)}</b><span class="subtext">${esc(identity.identifier)}</span></td><td><b>${esc(lab?.name || "实验评测")}</b>${checkpoint ? `<span class="subtext">${esc(checkpoint.name)}</span>` : ""}</td><td>${tag(gradeTypeLabel(entry.gradeType))}</td><td>${esc(course?.name || "未关联课程")}</td><td>${tag(entry.passed || entry.status === "已完成" ? "已通过" : "未通过")}</td><td>${entry.score == null ? "--" : `${esc(entry.score)} / ${esc(entry.maxScore || 100)}`}</td><td>${esc(formatTime(entry.at || entry.completedAt || entry.lastActivityAt))}</td></tr>`).join("");
  const completed = progressRows.filter(({ entry }) => entry.passed || entry.status === "已完成").length;
  const attempts = accountProgress.reduce((sum, [, progress]) => sum + Number(progress?.attempts || 0), 0);
  const scores = progressRows.map(({ entry }) => Number(entry.score)).filter(Number.isFinite);
  const activeStudents = accountProgress.filter(([, progress]) => Number(progress?.attempts || 0) > 0 || Object.keys(progress?.resourceProgress || {}).length > 0).length;
  const highestScore = scores.length ? Math.max(...scores) : "--";
  const regularCount = progressRows.filter(({ entry }) => entry.gradeType !== "exam").length;
  const examCount = progressRows.filter(({ entry }) => entry.gradeType === "exam").length;
  return head("评测与成绩", "按学生账号区分平时成绩和考试成绩。", button("查看课程", "go-courses", "secondary")) + metrics([["参与学生", activeStudents, "已有学习记录"], ["平时成绩", regularCount, "普通实验评测"], ["考试成绩", examCount, "关联考试评测"], ["最高成绩", highestScore, `${completed}/${attempts} 次通过`]]) + (rows ? `<section class="card"><table class="table"><thead><tr><th>学生</th><th>实验任务</th><th>成绩类型</th><th>课程</th><th>状态</th><th>成绩</th><th>评测时间</th></tr></thead><tbody>${rows}</tbody></table></section>` : emptyState("暂无评测数据", "学生完成正式评测后，将在这里按账号和成绩类型显示记录。", button("查看课程", "go-courses", "secondary")));
}

function settingsPage() {
  return head("教学设置", "完善教师信息，创建课程时将自动带入所属单位。") + `<section class="card"><form id="settingsForm" class="settings-form"><div class="form-grid"><div class="form-row"><label>教师姓名</label><input name="teacherName" maxlength="40" value="${esc(store.settings.teacherName)}" placeholder="请输入教师姓名" /></div><div class="form-row"><label>所属单位</label><input name="institution" maxlength="120" value="${esc(store.settings.institution)}" placeholder="请输入学校或院系" /></div></div><div class="form-actions"><button class="primary" type="submit">保存设置</button></div></form></section>`;
}

function formatTime(value) {
  if (!value) return "尚无记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "尚无记录" : date.toLocaleString("zh-CN", { hour12: false });
}

function publishedCourses() {
  return store.courses.filter((course) => ["已发布", "公开申请中", "已公开"].includes(course.status));
}

function studentHome() {
  const progress = store.studentProgress;
  const completed = progress.status === "已完成";
  const courses = publishedCourses();
  const stages = courses.reduce((sum, course) => sum + (course.stages?.length || 0), 0);
  const linkedLabs = new Set(courses.flatMap((course) => (course.stages || []).map((stage) => stage.labId).filter(Boolean))).size;
  const availableLabs = store.labs.filter((lab) => lab.state === "已发布").length + 1;
  const progressValue = completed ? 100 : progress.status === "进行中" ? 50 : 0;
  const scoreText = progress.score == null ? "--" : progress.score;
  const recentRecords = (progress.history || []).slice(0, 4);
  const recent = recentRecords.length
    ? `<div class="dashboard-records">${recentRecords.map((record) => `<article><span class="timeline-dot ${record.kind === "评测" ? "green" : "blue"}"></span><div><strong>${esc(record.title)}</strong><small>${esc(record.detail || record.kind || "学习活动")}</small></div><time>${esc(formatTime(record.at))}</time></article>`).join("")}</div>`
    : `<div class="dashboard-empty">进入课程或实训后，最近学习动态会显示在这里。</div>`;
  return head("学习概览", "个人学习进度、课程数据与常用功能集中展示。") +
    `<section class="student-dashboard-hero"><div><span class="overline">PERSONAL LEARNING CENTER</span><h2>${completed ? "本次实验已完成，继续巩固学习成果" : "继续你的学习计划"}</h2><p>${courses.length ? `当前有 ${courses.length} 门课程、${stages} 个课程阶段可以学习。` : "当前暂无已发布课程，可先从 Linux 基础实训开始。"}</p><div class="hero-actions">${button(completed ? "再次练习" : progress.status === "未开始" ? "开始实训" : "继续实训", "open-lab")}<button class="text-action" data-page="learning">查看我的课程</button></div></div><aside class="dashboard-progress"><div class="progress-ring" style="--progress:${progressValue}"><strong>${progressValue}%</strong><span>当前实训进度</span></div><div><b>${esc(progress.status)}</b><small>最近活动：${esc(formatTime(progress.lastActivityAt))}</small></div></aside></section>` +
    `<section class="student-data-grid"><article><span class="data-icon blue">课</span><div><strong>${courses.length}</strong><span>在学课程</span><small>${stages} 个课程阶段</small></div></article><article><span class="data-icon cyan">训</span><div><strong>${availableLabs}</strong><span>可用实训</span><small>${linkedLabs} 个课程关联实验</small></div></article><article><span class="data-icon violet">评</span><div><strong>${progress.attempts || 0}</strong><span>正式评测</span><small>累计提交次数</small></div></article><article><span class="data-icon green">绩</span><div><strong>${esc(scoreText)}</strong><span>当前成绩</span><small>${progress.score == null ? "完成评测后生成" : "满分 100 分"}</small></div></article></section>` +
    `<section class="student-shortcuts" aria-label="学习功能入口"><button data-page="learning"><span class="shortcut-icon">▤</span><strong>课程学习</strong><small>查看课程与章节安排</small><i>→</i></button><button data-page="practice"><span class="shortcut-icon">⌘</span><strong>实训与考试</strong><small>进入实验和评测任务</small><i>→</i></button><button data-page="grades"><span class="shortcut-icon">✓</span><strong>作业与成绩</strong><small>查看成绩与完成情况</small><i>→</i></button><button data-page="records"><span class="shortcut-icon">◷</span><strong>学习记录</strong><small>回顾个人学习轨迹</small><i>→</i></button></section>` +
    `<div class="student-dashboard-columns"><section class="card"><div class="card-head"><h2>当前任务</h2><button class="link" data-page="practice">全部任务</button></div><div class="current-learning-task"><span class="task-number">01</span><div><div class="task-title-line"><h3>Linux 文件权限实践</h3>${tag(completed ? "已通过" : progress.status)}</div><p>${completed ? "任务已完成，可再次进入环境复习命令。" : "创建 notes.txt、设置权限为 600，并通过正式评测。"}</p><div class="task-meta"><span>仅命令行</span><span>预计 10 分钟</span><span>${progress.attempts || 0} 次评测</span></div><div class="progress"><i style="width:${progressValue}%"></i></div></div>${button(progress.status === "未开始" ? "开始" : "进入", "open-lab", "secondary")}</div></section><section class="card"><div class="card-head"><h2>最近学习动态</h2><button class="link" data-page="records">查看全部</button></div>${recent}</section></div>`;
}

function studentLearningPage() {
  const courses = publishedCourses();
  const join = `<section class="card"><div class="card-head"><h2>使用邀请码加入课堂</h2></div><form id="joinClassroomForm" class="settings-form"><div class="form-grid"><div class="form-row"><label>课堂邀请码</label><input name="inviteCode" required maxlength="32" placeholder="请输入教师提供的邀请码" /></div><div class="form-actions"><button class="primary" type="submit">加入课堂</button></div></div></form></section>`;
  if (!courses.length) return head("课程学习", "按课程查看章节、知识点和学习目标。") + join + emptyState("暂无可见课程", "公开课程或通过邀请码加入的私有课程会显示在这里。", button("进入基础实验", "open-lab"));
  const cards = courses.map((course, index) => {
    const stages = course.stages || [];
    const labCount = stages.filter((stage) => stage.labId).length;
    const accent = ["blue", "cyan", "violet", "green", "orange", "indigo"][index % 6];
    return `<article class="student-course-card ${accent}"><div class="course-card-cover"><span>${esc(course.category || "实践课程")}</span><b>${esc(course.code || "COURSE")}</b></div><div class="course-card-body"><div class="course-card-tags"><span>${esc(course.term || "学期未设置")}</span>${tag(course.status)}</div><h2>${esc(course.name)}</h2><p>${esc(course.summary || "教师尚未填写课程简介")}</p><div class="course-card-stats"><span><b>${stages.length}</b> 个阶段</span><span><b>${labCount}</b> 个实训</span><span>${esc(course.totalHours ? `${course.totalHours} 学时` : "学时待定")}</span></div><button class="course-enter" data-action="view-student-course" data-id="${esc(course.id)}">查看课程安排 <span>→</span></button></div></article>`;
  }).join("");
  return head("课程学习", `共 ${courses.length} 门在学课程，点击课程查看具体教学安排。`) + join + `<div class="student-course-grid">${cards}</div>`;
}

function findCourseLearningItem(course, resourceId) {
  return [course?.resources, course?.assignments, course?.exams, course?.discussions, course?.moduleItems].flatMap((items) => Array.isArray(items) ? items : []).find((item) => item.id === resourceId);
}

async function updateResourceProgress(courseId, resourceId, status) {
  const course = store.courses.find((item) => item.id === courseId);
  const resource = findCourseLearningItem(course, resourceId);
  if (!course || !resource) return toast("课程资源不存在");
  if (apiBase) {
    try {
      const response = await fetch(`${apiBase}/student-progress/resources`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, resourceId, status }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "进度保存失败");
      store.studentProgress = { ...defaultStore.studentProgress, ...body, history: Array.isArray(body.history) ? body.history : [], resourceProgress: body.resourceProgress || {} };
      render();
      return resource;
    } catch (error) {
      toast(error.message || "进度保存失败");
      return null;
    }
  }
  const now = new Date().toISOString();
  store.studentProgress.resourceProgress ||= {};
  store.studentProgress.resourceProgress[resourceId] = { courseId, resourceId, status, completedSubtasks: status === "已完成" ? Number(resource.subtasks || 1) : 1, totalSubtasks: Number(resource.subtasks || 1), lastActivityAt: now, completedAt: status === "已完成" ? now : "" };
  store.studentProgress.history.unshift({ id: uid("record"), kind: "操作", title: `${status === "已完成" ? "完成" : "学习"}资源：${resource.name}`, detail: `${course.name} · ${resource.type}`, courseId, resourceId, at: now });
  localStorage.setItem("cloudlab-local-data", JSON.stringify(store));
  render();
  return resource;
}

function resourceLearningViewer(course, resource) {
  const stage = (course.stages || []).find((item) => (item.resourceIds || []).includes(resource.id));
  const url = /^https?:\/\//i.test(String(resource.url || "")) ? String(resource.url) : "";
  const progress = store.studentProgress.resourceProgress?.[resource.id] || {};
  const completed = progress.status === "已完成";
  const stageContent = String(stage?.content || "").trim();
  const sourceLink = /^https?:\/\//i.test(String(resource.sourceRepository || "")) ? String(resource.sourceRepository) : "";
  return `<div class="resource-learning-viewer">
    <header class="resource-viewer-summary"><div><span>${esc(course.name)} · ${esc(resource.type || "学习资料")}</span><h3>${esc(resource.name)}</h3><p>${esc(resource.description || "请按课程要求完成本项学习内容。")}</p></div><strong class="${completed ? "completed" : "learning"}">${completed ? "已完成" : "学习中"}</strong></header>
    ${stageContent ? `<section class="resource-learning-guide"><h4>本节学习要求</h4><pre>${esc(stageContent)}</pre></section>` : ""}
    ${url ? `<section class="resource-frame-section"><div class="resource-frame-toolbar"><div><b>在线教材</b><small>内容来自课程配置的授权学习页面</small></div><a class="secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">在新窗口打开</a></div><iframe class="resource-learning-frame" src="${esc(url)}" title="${esc(resource.name)}" loading="eager" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe><p class="resource-frame-tip">若教材站点限制嵌入显示，请使用右上角“在新窗口打开”。</p></section>` : `<section class="resource-no-frame"><strong>本资源暂无外部页面</strong><p>请按照上方学习要求完成阅读。</p></section>`}
    <footer class="resource-viewer-actions">${sourceLink ? `<a href="${esc(sourceLink)}" target="_blank" rel="noopener noreferrer">查看课程来源仓库</a>` : "<span></span>"}<div><button class="secondary" type="button" data-action="close-modal">返回课程</button><button class="primary" type="button" data-action="complete-resource-viewer" data-course-id="${esc(course.id)}" data-resource-id="${esc(resource.id)}" ${completed ? "disabled" : ""}>${completed ? "已完成学习" : "完成本节学习"}</button></div></footer>
  </div>`;
}

function openResourceViewer(courseId, resourceId) {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  const resource = findCourseLearningItem(course, resourceId);
  if (!course.id || !resource) return toast("课程资源不存在");
  $("#modalTitle").textContent = "在线自主学习";
  const form = $("#modalForm");
  form.dataset.type = "resourceViewer";
  form.dataset.id = courseId;
  form.dataset.itemId = resourceId;
  form.innerHTML = resourceLearningViewer(course, resource);
  $("#modalPanel").classList.add("resource-viewer-modal");
  $("#modalBackdrop").hidden = false;
}

function studentCourseDetailPage() {
  const course = publishedCourses().find((item) => item.id === store.selectedCourseId);
  if (!course) {
    store.page = "learning";
    return studentLearningPage();
  }
  ensureCourseCollections(course);
  const allStages = course.stages.filter((stage) => stage.visibility !== "暂不开放");
  const tab = store.filters.studentCourseTab || "all";
  const query = String(store.filters.courseResourceQuery || "").trim().toLowerCase();
  const stages = tab === "practice" ? allStages.filter((stage) => stage.labId || stage.type?.includes("实践")) : allStages;
  const labCount = allStages.filter((stage) => stage.labId).length;
  const tabs = `<div class="course-detail-tabs"><button class="${tab === "all" ? "active" : ""}" data-action="student-course-tab" data-tab="all">全部</button><button class="${tab === "practice" ? "active" : ""}" data-action="student-course-tab" data-tab="practice">实践项目</button>${course.assignments.some((item) => item.status === "已发布") ? `<button class="${tab === "assignments" ? "active" : ""}" data-action="student-course-tab" data-tab="assignments">作业</button>` : ""}${course.exams.some((item) => item.status === "已发布") ? `<button class="${tab === "exams" ? "active" : ""}" data-action="student-course-tab" data-tab="exams">考试</button>` : ""}${course.surveys.some((item) => item.status === "已发布") ? `<button class="${tab === "surveys" ? "active" : ""}" data-action="student-course-tab" data-tab="surveys">问卷</button>` : ""}${course.attendanceSessions.some((item) => item.status !== "草稿") ? `<button class="${tab === "attendance" ? "active" : ""}" data-action="student-course-tab" data-tab="attendance">签到</button>` : ""}${course.moduleItems.some((item) => item.status === "已发布") ? `<button class="${tab === "activities" ? "active" : ""}" data-action="student-course-tab" data-tab="activities">课堂活动</button>` : ""}<button class="${tab === "messages" ? "active" : ""}" data-action="student-course-tab" data-tab="messages">消息</button><button class="${tab === "discussion" ? "active" : ""}" data-action="student-course-tab" data-tab="discussion">讨论</button><input id="studentCourseSearch" value="${esc(store.filters.courseResourceQuery || "")}" placeholder="搜索资源名称" /></div>`;
  const progressMap = store.studentProgress.resourceProgress || {};
  const ungroupedStages = stages.filter((stage) => !stage.lectureId);
  const studentLectures = course.lectures.length ? [...course.lectures, ...(ungroupedStages.length ? [{ id: "", name: "其他学习内容", description: "尚未归入讲次的课程阶段" }] : [])] : [{ id: "", name: "课程内容", description: course.summary }];
  const renderResource = (resource) => {
    const progress = progressMap[resource.id] || {};
    const completed = progress.status === "已完成";
    const submissionKind = course.exams.some((item) => item.id === resource.id) ? "exam" : course.assignments.some((item) => item.id === resource.id) ? "assignment" : "";
    const submission = submissionKind ? course.submissions.find((item) => item.activityId === resource.id && (item.studentId === currentStudentId() || (item.groupMemberIds || []).includes(currentStudentId()))) : null;
    const total = Number(resource.subtasks || 1);
    const done = completed ? total : Number(progress.completedSubtasks || 0);
    const resourceType = String(resource.type || "学习资源");
    const actions = submissionKind
      ? `${button(submission ? "查看/重新提交" : "提交任务", "submit-activity", "primary", `data-course-id="${esc(course.id)}" data-resource-id="${esc(resource.id)}" data-kind="${submissionKind}"`)}${submission ? tag(submission.status || "已提交") : ""}`
      : `${button(completed ? "再次学习" : "查看详情", "open-resource", "secondary", `data-course-id="${esc(course.id)}" data-resource-id="${esc(resource.id)}"`)}${completed ? tag("已完成") : button("标记完成", "complete-resource", "secondary", `data-course-id="${esc(course.id)}" data-resource-id="${esc(resource.id)}"`)}`;
    return `<article><span class="schedule-type content">${resourceType === "视频" ? "▶" : resourceType.includes("作业") ? "✓" : "≡"}</span><div><button type="button" class="resource-learning-link" data-action="open-resource" data-course-id="${esc(course.id)}" data-resource-id="${esc(resource.id)}">${esc(resource.name)}</button><small>${esc(resource.description || resourceType)}</small></div><span class="schedule-meta">${done}/${total} · ${esc(resourceType)}</span><div class="resource-actions">${actions}</div></article>`;
  };
  const activityItems = (tab === "assignments" ? course.assignments : tab === "exams" ? course.exams : tab === "activities" ? course.moduleItems : []).filter((item) => item.status === "已发布" && (!query || `${item.title} ${item.description} ${item.type || moduleLabel(item.moduleId)}`.toLowerCase().includes(query)));
  const activityTitle = tab === "exams" ? "考试任务" : tab === "assignments" ? "作业任务" : "课堂活动";
  const activitySchedule = activityItems.length ? `<div class="course-schedule"><section class="schedule-section"><header><span class="schedule-number">${tab === "exams" ? "考" : tab === "assignments" ? "作" : "活"}</span><div><span class="section-eyebrow">${activityTitle}</span><h2>${activityTitle}</h2><p>按要求完成并提交，完成状态将同步到教师统计。</p></div><strong>${activityItems.length} 项任务</strong></header><div class="schedule-items">${activityItems.map((item) => renderResource({ ...item, name: item.title, type: item.type || moduleLabel(item.moduleId), subtasks: item.subtasks || 1 })).join("")}</div></section></div>` : `<section class="course-detail-empty"><span>▤</span><h3>暂无已发布任务</h3><p>教师发布后会显示在这里。</p></section>`;
  const pendingPeerTargets = course.peerReviewTargets.filter((target) => !course.peerReviews.some((review) => review.submissionId === target.id && review.reviewerId === currentStudentId()));
  const appealItems = course.submissions.filter((submission) => submission.status === "已批阅").map((submission) => ({ submission, appeal: course.gradeAppeals.find((item) => item.submissionId === submission.id) }));
  const assignmentFollowUp = tab === "assignments" && (pendingPeerTargets.length || appealItems.length) ? `<div class="course-schedule"><section class="schedule-section"><header><span class="schedule-number">评</span><div><span class="section-eyebrow">学习评价</span><h2>互评与成绩复核</h2><p>完成教师开放的同伴互评，也可对本人已批阅成绩发起申诉。</p></div></header><div class="schedule-items">${pendingPeerTargets.map((target) => { const task = course.assignments.find((item) => item.id === target.activityId); return `<article><span class="schedule-type content">评</span><div><b>${esc(task?.title || "作业互评")}</b><small>${esc(target.studentName)}的提交</small></div><span class="schedule-meta">待互评</span>${button("开始互评", "peer-review", "secondary", `data-course-id="${esc(course.id)}" data-submission-id="${esc(target.id)}"`)}</article>`; }).join("")}${appealItems.map(({ submission, appeal }) => { const task = course.assignments.find((item) => item.id === submission.activityId); return `<article><span class="schedule-type content">诉</span><div><b>${esc(task?.title || "成绩复核")}</b><small>当前成绩 ${esc(submission.score ?? "--")} · ${esc(submission.feedback || "暂无反馈")}</small></div><span class="schedule-meta">${esc(appeal?.status || "可申诉")}</span>${!appeal || appeal.status !== "待处理" ? button("申请复核", "grade-appeal", "secondary", `data-course-id="${esc(course.id)}" data-submission-id="${esc(submission.id)}"`) : ""}</article>`; }).join("")}</div></section></div>` : "";
  const assignmentSchedule = `${activitySchedule}${assignmentFollowUp}`;
  const surveySchedule = course.surveys.filter((item) => item.status === "已发布").length ? `<div class="course-schedule"><section class="schedule-section"><header><span class="schedule-number">问</span><div><span class="section-eyebrow">课程反馈</span><h2>问卷调查</h2><p>按要求完成教师发布的问卷。</p></div></header><div class="schedule-items">${course.surveys.filter((item) => item.status === "已发布").map((survey) => { const response = course.surveyResponses.find((item) => item.surveyId === survey.id && item.studentId === currentStudentId()); return `<article><span class="schedule-type content">?</span><div><b>${esc(survey.title)}</b><small>${esc(survey.description || `${survey.questions?.length || 0} 道题`)}</small></div><span class="schedule-meta">${response ? "已提交" : "待填写"}</span>${button(response ? "查看/修改" : "填写问卷", "submit-survey", "secondary", `data-course-id="${esc(course.id)}" data-survey-id="${esc(survey.id)}"`)}</article>`; }).join("")}</div></section></div>` : `<section class="course-detail-empty"><span>?</span><h3>暂无已发布问卷</h3></section>`;
  const attendanceSchedule = course.attendanceSessions.filter((item) => item.status !== "草稿").length ? `<div class="course-schedule"><section class="schedule-section"><header><span class="schedule-number">签</span><div><span class="section-eyebrow">课堂出勤</span><h2>在线签到</h2><p>在教师开放签到后输入签到码。</p></div></header><div class="schedule-items">${course.attendanceSessions.filter((item) => item.status !== "草稿").map((session) => { const record = course.attendanceRecords.find((item) => item.sessionId === session.id && item.studentId === currentStudentId()); return `<article><span class="schedule-type content">✓</span><div><b>${esc(session.title)}</b><small>${esc(session.description || session.scheduledAt || "课堂签到")}</small></div><span class="schedule-meta">${record ? `${record.late ? "迟到" : "已签到"} · ${esc(formatTime(record.checkedInAt))}` : session.status}</span>${session.status === "进行中" && !record ? button("立即签到", "check-in-attendance", "secondary", `data-course-id="${esc(course.id)}" data-session-id="${esc(session.id)}"`) : ""}</article>`; }).join("")}</div></section></div>` : `<section class="course-detail-empty"><span>✓</span><h3>暂无签到任务</h3></section>`;
  const messageSchedule = `<div class="course-schedule"><section class="schedule-section"><header><span class="schedule-number">信</span><div><span class="section-eyebrow">师生沟通</span><h2>站内消息</h2><p>查看教师通知或向课程教师提问。</p></div>${button("联系教师", "new-message", "secondary", `data-id="${esc(course.id)}"`)}</header><div class="schedule-items">${course.messages.map((message) => `<article><span class="schedule-type content">信</span><div><b>${esc(message.subject)}</b><small>${esc(message.content)}</small></div><span class="schedule-meta">${esc(message.senderName)} · ${esc(formatTime(message.createdAt))}</span></article>`).join("") || `<div class="compact-empty">暂无站内消息</div>`}</div></section></div>`;
  const schedule = tab === "assignments" ? assignmentSchedule : tab === "exams" || tab === "activities" ? activitySchedule : tab === "surveys" ? surveySchedule : tab === "attendance" ? attendanceSchedule : tab === "messages" ? messageSchedule : tab === "discussion"
    ? (course.discussions.filter((item) => item.status === "已发布").length ? `<div class="course-schedule">${course.discussions.filter((item) => item.status === "已发布" && (!query || `${item.title} ${item.description}`.toLowerCase().includes(query))).map((item, index) => { const replies = course.discussionReplies.filter((reply) => reply.discussionId === item.id); return `<section class="schedule-section"><header><span class="schedule-number">${String(index + 1).padStart(2, "0")}</span><div><span class="section-eyebrow">互动讨论</span><h2>${esc(item.title)}</h2><p>${esc(item.description || "欢迎参与课堂讨论")}</p></div><div><strong>${replies.length} 条回复</strong>${button("参与讨论", "reply-discussion", "secondary", `data-course-id="${esc(course.id)}" data-discussion-id="${esc(item.id)}"`)}</div></header>${replies.length ? `<div class="activity">${replies.slice(-20).map((reply) => `<div class="activity-row"><span class="activity-mark">论</span><div><b>${esc(reply.studentName || "学生")}</b><small>${esc(reply.content)} · ${esc(formatTime(reply.createdAt))}</small></div></div>`).join("")}</div>` : `<div class="compact-empty">还没有回复，欢迎发表第一个观点。</div>`}</section>`; }).join("")}</div>` : `<section class="course-detail-empty"><span>◌</span><h3>暂无课程讨论</h3><p>教师发布讨论主题后会显示在这里。</p></section>`)
    : stages.length
      ? `<div class="course-schedule">${studentLectures.map((lecture, lectureIndex) => {
          const lectureStages = stages.filter((stage) => (stage.lectureId || "") === lecture.id);
          if (!lectureStages.length) return "";
          const stageSections = lectureStages.map((stage) => {
            const lab = store.labs.find((item) => item.id === stage.labId && item.state === "已发布");
            const resources = (stage.resourceIds || []).map((id) => course.resources.find((item) => item.id === id && item.status === "已发布")).filter(Boolean).filter((item) => !query || `${item.name} ${item.description} ${item.type}`.toLowerCase().includes(query));
            const knowledge = (stage.knowledgePointIds || []).map((id) => course.knowledgePoints.find((item) => item.id === id)).filter(Boolean);
            if (query && !resources.length && !(lab && `${lab.name} ${lab.description}`.toLowerCase().includes(query))) return "";
            const labItem = lab ? `<article><span class="schedule-type lab">⌘</span><div><b>${esc(lab.name)}</b><small>${esc(lab.objectives || lab.description || "在线实验")}</small></div><span class="schedule-meta">${esc(lab.mode)} · ${esc(lab.duration)} 分钟</span>${button("进入实训", "open-linked-lab", "secondary", `data-lab-id="${esc(lab.id)}" data-course-id="${esc(course.id)}"`)}</article>` : "";
            const resourceItems = resources.map(renderResource).join("");
            const learningContent = String(stage.content || "").trim();
            return `<div class="student-stage-block"><div class="student-stage-heading"><span>${esc(stage.type || "学习阶段")}</span><strong>${esc(stage.name)}</strong><small>${esc(stage.objectives || stage.description || "按计划完成学习内容")}</small>${knowledge.length ? `<div class="student-knowledge-tags">${knowledge.map((point) => `<i>${esc(point.name)}</i>`).join("")}</div>` : ""}</div>${learningContent ? `<details class="student-stage-content"><summary>查看具体学习内容</summary><div class="student-stage-content-copy">${esc(learningContent)}</div></details>` : ""}<div class="schedule-items">${labItem}${resourceItems || (!lab ? `<article><span class="schedule-type content">≡</span><div><b>${esc(stage.name)}</b><small>${esc(stage.description || "学习内容")}</small></div><span class="schedule-meta">${esc(stage.estimatedMinutes || 0)} 分钟</span>${tag("学习内容")}</article>` : "")}</div></div>`;
          }).join("");
          return stageSections ? `<section class="schedule-section"><header><span class="schedule-number">${String(lectureIndex + 1).padStart(2, "0")}</span><div><span class="section-eyebrow">${esc(lecture.mode || "教学讲次")}</span><h2>${esc(lecture.name)}</h2><p>${esc(lecture.description || "按教学计划完成本讲学习内容。")}</p></div><strong>${lectureStages.length} 个阶段</strong></header>${stageSections}</section>` : "";
        }).join("")}</div>`
      : `<section class="course-detail-empty"><span>▤</span><h3>${tab === "practice" ? "暂无实践项目" : "课程安排尚未发布"}</h3><p>${tab === "practice" ? "本课程暂未关联可用实训。" : "教师编排课程阶段后会显示在这里。"}</p></section>`;
  const lastResourceRecord = (store.studentProgress.history || []).find((item) => item.courseId === course.id && item.resourceId);
  const continueButton = lastResourceRecord ? `<button class="secondary" data-action="open-resource" data-course-id="${esc(course.id)}" data-resource-id="${esc(lastResourceRecord.resourceId)}">继续上次学习</button>` : "";
  const latestNotice = course.notices.find((item) => item.status === "已发布");
  const studentCourseActions = `<button class="secondary" data-action="back-student-courses">返回课程</button>${course.allowRoleApplication ? `<button class="secondary" data-action="apply-course-role" data-id="${esc(course.id)}">申请教师/助教</button>` : ""}`;
  return head(course.name, `${course.code} · ${course.term || "学期未设置"}`, studentCourseActions) +
    `<section class="student-course-detail-hero"><div><span class="overline">${esc(course.category || "实践课程")}</span><h2>${esc(course.name)}</h2><p>${esc(course.summary || "教师尚未填写课程简介")}</p><div class="course-detail-meta"><span>◷ ${esc(course.startDate && course.endDate ? `${course.startDate} 至 ${course.endDate}` : course.startDate || course.endDate || "日期待定")}</span><span>▤ ${allStages.length} 个课程阶段</span><span>⌘ ${labCount} 个实践项目</span><span>☆ ${esc(course.credits ? `${course.credits} 学分` : "学分待定")}</span></div>${continueButton}</div><aside><strong>${allStages.length}</strong><span>课程阶段</span><small>${esc(course.totalHours ? `${course.totalHours} 学时` : "学时待定")}</small></aside></section>` + (latestNotice ? `<section class="course-notice-strip"><span>公告</span><strong>${esc(latestNotice.title)}</strong><p>${esc(latestNotice.description || "")}</p><time>${esc(formatTime(latestNotice.publishedAt || latestNotice.updatedAt))}</time></section>` : "") + tabs + schedule;
}

function studentPracticePage() {
  const publishedLabs = store.labs.filter((lab) => lab.state === "已发布");
  const progress = store.studentProgress;
  const builtIn = `<article class="practice-card"><span class="practice-step">01</span><div class="practice-main"><div class="practice-title"><h2>Linux 文件权限实践</h2>${tag(progress.status === "已完成" ? "已通过" : progress.status)}</div><p>真实 Ubuntu 命令行 · 创建 notes.txt 并设置权限为 600</p><div class="task-meta"><span>仅命令行</span><span>预计 10 分钟</span><span>${progress.attempts || 0} 次正式评测</span></div></div><div class="practice-action">${button(progress.status === "未开始" ? "开始实验" : "进入实验", "open-lab")}<small>${progress.score == null ? "尚无成绩" : `最高 ${progress.score} 分`}</small></div></article>`;
  const labs = publishedLabs.map((lab, index) => `<article class="practice-card"><span class="practice-step">${String(index + 2).padStart(2, "0")}</span><div class="practice-main"><div class="practice-title"><h2>${esc(lab.name)}</h2>${tag(lab.state)}</div><p>${esc(lab.objectives || lab.description || "教师尚未填写任务说明")}</p><div class="task-meta"><span>${esc(lab.mode)}</span><span>${esc(lab.duration)} 分钟</span></div></div><div class="practice-action">${lab.builtIn ? button("进入实验", "open-lab", "primary", `data-lab-id="${esc(lab.id)}"`) : `<button class="secondary" disabled>环境待配置</button>`}<small>${lab.builtIn ? "环境可用" : "需教师配置运行环境"}</small></div></article>`).join("");
  return head("实训与考试", "所有状态和成绩均来自真实实验操作。") + `<div class="task-filter"><button class="filter-chip active">全部</button><span>${1 + publishedLabs.length} 个可见任务</span></div><div class="practice-list">${builtIn}${labs}</div>`;
}

function studentGradesPage() {
  const progress = store.studentProgress;
  const allSubmissions = store.courses.flatMap((course) => ensureCourseCollections(course).submissions.filter((item) => item.studentId === currentStudentId() || (item.groupMemberIds || []).includes(currentStudentId())).map((item) => ({ ...item, course })));
  const submissions = allSubmissions.filter((item) => !item.labId);
  const graded = submissions.filter((item) => item.status === "已批阅");
  const sourceGradeRecords = Array.isArray(progress.gradeRecords) && progress.gradeRecords.length
    ? progress.gradeRecords
    : Object.values(progress.resourceProgress || {}).filter((entry) => entry?.labId && entry.checkpointId).map((entry) => {
        const legacySubmission = allSubmissions.find((item) => item.labId === entry.labId && item.checkpointId === entry.checkpointId);
        const legacyExam = legacySubmission?.course?.exams?.find((item) => item.id === legacySubmission.activityId);
        return { ...entry, gradeType: entry.gradeType || (entry.examId || legacySubmission ? "exam" : "regular"), examId: entry.examId || legacySubmission?.activityId || "", score: legacySubmission?.score ?? entry.score, maxScore: legacyExam?.totalScore || 100, passed: entry.status === "已完成", at: entry.completedAt || entry.lastActivityAt };
      });
  const labEvaluations = sourceGradeRecords.map((entry) => {
    const lab = store.labs.find((item) => item.id === entry.labId);
    const checkpoint = lab && normalizedCheckpoints(lab).find((item) => item.id === entry.checkpointId);
    const course = store.courses.find((item) => item.id === entry.courseId) || store.courses.find((item) => (item.stages || []).some((stage) => stage.labId === entry.labId));
    return { entry, lab, checkpoint, course };
  }).sort((a, b) => String(b.entry.at || b.entry.completedAt || b.entry.lastActivityAt || "").localeCompare(String(a.entry.at || a.entry.completedAt || a.entry.lastActivityAt || "")));
  if (!labEvaluations.length && !progress.attempts && !submissions.length) return head("作业与成绩", "查看正式评测结果和教师反馈。") + emptyState("暂无成绩", "提交作业、考试或完成实验评测后，结果会记录在这里。", button("进入实验", "open-lab"));
  const submissionRows = submissions.map((submission) => {
    const task = [...submission.course.assignments, ...submission.course.exams].find((item) => item.id === submission.activityId);
    return `<tr><td><span class="course-title">${esc(task?.title || "学习任务")}</span><span class="subtext">${esc(submission.course.name)}</span></td><td>${tag(submission.kind === "exam" ? "考试成绩" : "平时成绩")}</td><td>${tag(submission.status)}</td><td>${submission.score == null ? "--" : `${esc(submission.score)} / ${esc(task?.totalScore || 100)}`}</td><td>${esc(formatTime(submission.gradedAt || submission.submittedAt))}</td><td><span class="subtext">${esc(submission.feedback || "等待教师反馈")}</span></td></tr>`;
  }).join("");
  const labRows = labEvaluations.map(({ entry, lab, checkpoint, course }) => `<tr><td><span class="course-title">${esc(lab?.name || "代码实验")}</span><span class="subtext">${esc(checkpoint?.name || course?.name || "自动评测")}</span></td><td>${tag(gradeTypeLabel(entry.gradeType))}</td><td>${tag(entry.passed || entry.status === "已完成" ? "已通过" : "未通过")}</td><td>${entry.score == null ? "--" : `${esc(entry.score)} / ${esc(entry.maxScore || 100)}`}</td><td>${esc(formatTime(entry.at || entry.completedAt || entry.lastActivityAt))}</td><td><button class="link" data-action="open-lab" data-lab-id="${esc(entry.labId)}" data-course-id="${esc(entry.courseId || course?.id || "")}" data-checkpoint-id="${esc(entry.checkpointId)}">查看实验</button></td></tr>`).join("");
  const legacyLabRow = !labEvaluations.length && progress.attempts ? `<tr><td><span class="course-title">Linux 文件权限实践</span><span class="subtext">自动评测</span></td><td>${tag("平时成绩")}</td><td>${tag(progress.status)}</td><td>${progress.score == null ? "--" : esc(progress.score)}</td><td>${esc(formatTime(progress.completedAt || progress.lastActivityAt))}</td><td><button class="link" data-action="open-lab">查看实验</button></td></tr>` : "";
  const scores = [...labEvaluations.map(({ entry }) => entry.score), progress.score, ...graded.map((item) => item.score)].filter((item) => item != null).map(Number);
  const evaluatedLabs = labEvaluations.length || (progress.attempts ? 1 : 0);
  return head("作业与成绩", "平时实验成绩与关联考试的成绩分开记录。") +
    `<div class="grade-summary"><article><span>已提交任务</span><strong>${submissions.length + evaluatedLabs}</strong><small>作业、考试与实验</small></article><article><span>已批阅</span><strong>${graded.length + labEvaluations.filter(({ entry }) => entry.score != null).length + (!labEvaluations.length && progress.score != null ? 1 : 0)}</strong><small>已有成绩的任务</small></article><article><span>最高成绩</span><strong>${scores.length ? Math.max(...scores) : "--"}</strong><small>最近 ${esc(formatTime(progress.lastActivityAt))}</small></article></div>` +
    `<section class="card"><table class="table"><thead><tr><th>任务</th><th>成绩类型</th><th>状态</th><th>成绩</th><th>更新时间</th><th>详情</th></tr></thead><tbody>${submissionRows}${labRows}${legacyLabRow}</tbody></table></section>`;
}

function studentRecordsPage() {
  const records = store.studentProgress.history || [];
  if (!records.length) return head("学习记录", "按时间查看真实的实验操作与评测记录。") + emptyState("暂无学习记录", "进入实验、执行命令或提交评测后，记录会显示在这里。", button("开始实验", "open-lab"));
  return head("学习记录", "按时间查看真实的实验操作与评测记录。") + `<section class="card timeline-card">${records.slice(0, 50).map((record) => `<article class="timeline-row"><time>${esc(formatTime(record.at))}</time><span class="timeline-dot ${record.kind === "评测" ? "green" : "blue"}"></span><div><b>${esc(record.title)}</b><p>${esc(record.detail || "")}</p></div></article>`).join("")}</section>`;
}

function runtimeState(ok, yes = "正常", no = "未配置") {
  return `<span class="runtime-state ${ok ? "ok" : "muted"}"><i></i>${ok ? yes : no}</span>`;
}

function adminOverviewPage() {
  const terminal = adminRuntime.terminal || {};
  const cluster = adminRuntime.cluster || {};
  const active = Number(terminal.activeSessions || 0);
  const capacity = Number(terminal.maxSessions || 0);
  const healthUp = String(adminRuntime.health?.status || "").toUpperCase() === "UP";
  const publishedCourses = store.courses.filter((course) => ["已发布", "已公开"].includes(course.status)).length;
  const publishedLabs = store.labs.filter((lab) => lab.state === "已发布").length;
  const inventory = [
    ...store.courses.map((course) => ["课程", course.name, course.code || "未设置编号", course.status || "草稿"]),
    ...store.labs.map((lab) => ["实验", lab.name, `${lab.mode || "模式未设置"} · ${lab.duration || "--"} 分钟`, lab.state || "草稿"]),
  ];
  const inventoryBody = inventory.length
    ? `<table class="table"><thead><tr><th>类型</th><th>名称</th><th>配置</th><th>状态</th></tr></thead><tbody>${inventory.slice(0, 8).map(([type, name, detail, status]) => `<tr><td>${esc(type)}</td><td><span class="course-title">${esc(name)}</span></td><td>${esc(detail)}</td><td>${tag(status)}</td></tr>`).join("")}</tbody></table>`
    : `<div class="admin-empty-row">当前没有课程或实验模板数据。</div>`;
  return head("资源概览", "课程、实验环境与平台服务的实时状态。", `<button class="secondary" data-action="refresh-admin-runtime">刷新状态</button>`) +
    metrics([["课程", store.courses.length, `${publishedCourses} 门已发布`], ["实验模板", store.labs.length, `${publishedLabs} 个已发布`], ["活跃终端", active, capacity ? `容量 ${active}/${capacity}` : "终端池未配置"], ["平台服务", healthUp ? "正常" : adminRuntime.loading ? "检查中" : "异常", adminRuntime.checkedAt ? `更新于 ${formatTime(adminRuntime.checkedAt)}` : "等待状态检查"]]) +
    `<div class="admin-runtime-grid"><section class="card"><div class="card-head"><h2>服务运行状态</h2><span class="runtime-updated">${adminRuntime.loading ? "读取中" : esc(formatTime(adminRuntime.checkedAt))}</span></div><div class="runtime-list"><article><span class="runtime-icon blue">API</span><div><strong>核心业务接口</strong><small>${esc(adminRuntime.health?.service || "学生实践平台 API")}</small></div>${runtimeState(healthUp)}</article><article><span class="runtime-icon cyan">终</span><div><strong>隔离终端资源池</strong><small>${esc(terminal.image || "尚未配置终端镜像")}</small></div>${runtimeState(Boolean(terminal.enabled), "已启用", "未启用")}</article><article><span class="runtime-icon violet">云</span><div><strong>云资源适配器</strong><small>${esc(adminRuntime.cloud?.message || "尚未返回适配器状态")}</small></div>${runtimeState(Boolean(adminRuntime.cloud?.configured), "已接入", "未接入")}</article><article><span class="runtime-icon green">集</span><div><strong>Hadoop / Spark 集群</strong><small>Hadoop ${esc(cluster.hadoop?.version || "--")} · Spark ${esc(cluster.spark?.version || "--")}</small></div>${runtimeState(Boolean(cluster.healthy), "运行中", cluster.configured ? "启动中" : "未部署")}</article><article><span class="runtime-icon green">数</span><div><strong>平台数据存储</strong><small>数据版本 v${DATA_VERSION} · 课程与实验配置可持久化</small></div>${runtimeState(Boolean(apiBase), "已连接", "本地模式")}</article></div></section><section class="card admin-capacity"><div class="card-head"><h2>终端容量</h2><button class="link" data-page="resources">查看资源池</button></div><div class="capacity-number"><strong>${active}</strong><span>/ ${capacity || "--"} 个会话</span></div><div class="capacity-bar"><i style="width:${capacity ? Math.min(100, active / capacity * 100) : 0}%"></i></div><dl><div><dt>单会话内存</dt><dd>${esc(terminal.limits?.memoryMiB || "--")} MiB</dd></div><div><dt>单会话 CPU</dt><dd>${esc(terminal.limits?.cpu || "--")} 核</dd></div><div><dt>最长时长</dt><dd>${esc(terminal.limits?.maxMinutes || "--")} 分钟</dd></div><div><dt>隔离方式</dt><dd>${esc(terminal.isolation || "未返回")}</dd></div></dl></section></div>` +
    `<section class="card admin-inventory"><div class="card-head"><h2>内容资源清单</h2><span>${inventory.length} 项真实数据</span></div>${inventoryBody}</section>`;
}

function adminResourcesPage() {
  const terminal = adminRuntime.terminal || {};
  const cluster = adminRuntime.cluster || {};
  const active = Number(terminal.activeSessions || 0);
  const capacity = Number(terminal.maxSessions || 0);
  const reviewRows = store.labs.filter((lab) => lab.publicScope === "申请公开").map((lab) => `<tr><td><b>${esc(lab.name)}</b><span class="subtext">${esc(lab.techPlatform || "Linux")} · ${esc(lab.mode || "仅命令行")}</span></td><td>${tag(lab.state)}</td><td>${tag(lab.publicReviewStatus || "待审核")}</td><td>${lab.publicReviewStatus === "已通过" ? `<button class="link" data-action="review-lab-public" data-id="${esc(lab.id)}" data-decision="撤回">撤回公开</button>` : `<button class="link" data-action="review-lab-public" data-id="${esc(lab.id)}" data-decision="通过">通过</button><button class="link text-danger" data-action="review-lab-public" data-id="${esc(lab.id)}" data-decision="驳回">驳回</button>`}</td></tr>`).join("");
  return head("云资源池", "查看当前可用实验资源、隔离策略和云适配器状态。", `<button class="secondary" data-action="refresh-admin-runtime">刷新状态</button>`) +
    `<div class="admin-resource-cards"><article class="card admin-resource-card"><div class="resource-card-title"><span class="runtime-icon cyan">终</span><div><h2>Docker 交互终端</h2><p>${esc(terminal.image || "镜像未配置")}</p></div>${runtimeState(Boolean(terminal.enabled), "运行中", "未启用")}</div><div class="resource-big-value">${active}<small>/ ${capacity || "--"} 会话</small></div><dl><div><dt>按 IP 分片</dt><dd>${terminal.perIpLimitEnabled ? esc(terminal.maxSessionsPerIp) : "不启用"}</dd></div><div><dt>内存限制</dt><dd>${esc(terminal.limits?.memoryMiB || "--")} MiB</dd></div><div><dt>CPU 限制</dt><dd>${esc(terminal.limits?.cpu || "--")} 核</dd></div><div><dt>进程限制</dt><dd>${esc(terminal.limits?.processes || "--")}</dd></div></dl></article><article class="card admin-resource-card"><div class="resource-card-title"><span class="runtime-icon violet">资</span><div><h2>实验运行适配器</h2><p>${esc(adminRuntime.cloud?.provider || "not-configured")}</p></div>${runtimeState(Boolean(adminRuntime.cloud?.configured), "已接入", "未接入")}</div><div class="adapter-message">${esc(adminRuntime.cloud?.message || "当前未获得实验运行状态。")}</div><dl><div><dt>代码文件</dt><dd>可用</dd></div><div><dt>命令行</dt><dd>${terminal.enabled ? "可用" : "受限模式"}</dd></div><div><dt>资源调度</dt><dd>${adminRuntime.cloud?.configured ? "已连接" : "本机运行"}</dd></div><div><dt>最近检查</dt><dd>${esc(formatTime(adminRuntime.checkedAt))}</dd></div></dl></article><article class="card admin-resource-card"><div class="resource-card-title"><span class="runtime-icon green">集</span><div><h2>大数据教学集群</h2><p>${esc(cluster.mode || "Hadoop / Spark")}</p></div>${runtimeState(Boolean(cluster.healthy), "运行中", cluster.configured ? "启动中" : "未部署")}</div><div class="adapter-message">Hadoop ${esc(cluster.hadoop?.version || "--")} · Spark ${esc(cluster.spark?.version || "--")}</div><dl><div><dt>NameNode / DataNode</dt><dd>${cluster.hadoop?.nameNode && cluster.hadoop?.dataNode ? "可用" : "未就绪"}</dd></div><div><dt>Master / Worker</dt><dd>${cluster.spark?.master && cluster.spark?.worker ? "可用" : "未就绪"}</dd></div><div><dt>Worker 数量</dt><dd>${esc(cluster.spark?.workers ?? "--")}</dd></div><div><dt>并发建议</dt><dd>${esc(cluster.limits?.concurrency || "--")}</dd></div></dl></article></div>` +
    `<section class="card admin-capacity-editor"><div class="card-head"><h2>管理员分配可连接容器数量</h2><span>当前 ${active} 个活跃会话</span></div><p class="subtext">取消项目和 IP 的容器分片限制，所有课程共享管理员分配的总容器数。调整容量不会中断已有会话。</p><form id="terminalCapacityForm" class="settings-form"><div class="form-grid"><div class="form-row"><label>可连接容器数量</label><input name="maxSessions" type="number" min="1" max="200" required value="${esc(capacity || 10)}" /><small>允许范围：1—200 个；达到容量后新连接会等待。</small></div></div><div class="form-actions"><button class="primary" type="submit">保存容器分配</button></div></form></section>` +
    `<section class="card admin-policy"><div class="card-head"><h2>当前隔离与回收策略</h2></div><div class="policy-grid"><article><strong>网络隔离</strong><span>${esc(terminal.isolation || "未返回隔离信息")}</span></article><article><strong>空闲回收</strong><span>${esc(terminal.limits?.idleMinutes || "--")} 分钟无操作后回收</span></article><article><strong>最长运行</strong><span>${esc(terminal.limits?.maxMinutes || "--")} 分钟后强制回收</span></article><article><strong>容器配额</strong><span>管理员分配 ${capacity || "--"} 个，不按 IP 切分</span></article></div></section><section class="card admin-inventory"><div class="card-head"><h2>实验公开审核</h2><span>${store.labs.filter((lab) => lab.publicScope === "申请公开" && (lab.publicReviewStatus || "待审核") === "待审核").length} 项待审核</span></div><table class="table"><thead><tr><th>实验模板</th><th>发布状态</th><th>公开审核</th><th>操作</th></tr></thead><tbody>${reviewRows || `<tr><td colspan="4"><div class="empty">暂无公开申请</div></td></tr>`}</tbody></table></section>`;
}

function adminUsersPage() {
  const auditCount = store.studentProgress.history?.length || 0;
  return head("用户与权限", "平台账号身份决定教师、学生或管理工作台；教师账号默认拥有全部教学建设权限。") +
    metrics([["身份认证", authState.authRequired ? "已启用" : "开发模式", authState.authRequired ? "服务端会话与密码认证" : "生产环境需启用 CLOUDLAB_AUTH_REQUIRED"], ["平台角色", 3, "教师、学生、管理员"], ["教师权限", "完整", "课程、实验、题库和试卷建设"], ["学习审计", auditCount, "真实学习操作记录"]]) +
    `<div class="admin-users-grid"><section class="card"><div class="card-head"><h2>角色权限矩阵</h2><span>登录后不可切换身份</span></div><table class="table permission-table"><thead><tr><th>角色</th><th>课程与试卷</th><th>实验建设</th><th>平台配置</th></tr></thead><tbody><tr><td><b>教师</b><small>全部教学建设能力</small></td><td>${runtimeState(true, "可管理")}</td><td>${runtimeState(true, "可配置")}</td><td>${runtimeState(false, "", "不可访问")}</td></tr><tr><td><b>学生</b><small>学习与评测</small></td><td>${runtimeState(false, "", "只读")}</td><td>${runtimeState(true, "可使用")}</td><td>${runtimeState(false, "", "不可访问")}</td></tr><tr><td><b>管理员</b><small>账号与平台运行管理</small></td><td>${runtimeState(true, "可查看")}</td><td>${runtimeState(true, "可查看")}</td><td>${runtimeState(true, "可管理")}</td></tr></tbody></table></section><section class="card"><div class="card-head"><h2>创建平台账号</h2></div><form id="accountCreateForm" class="settings-form"><div class="form-grid"><div class="form-row"><label>用户名</label><input name="username" required pattern="[A-Za-z0-9._-]{3,80}" /></div><div class="form-row"><label>姓名</label><input name="name" required maxlength="80" /></div><div class="form-row"><label>初始密码</label><input name="password" type="password" required minlength="8" /></div><div class="form-row"><label>账号身份</label><select name="role"><option value="teacher">教师</option><option value="student">学生</option><option value="admin">管理员</option></select></div></div><div class="form-actions"><button class="primary" type="submit">创建账号</button></div></form></section></div>`;
}

function adminSettingsPage() {
  const terminal = adminRuntime.terminal || {};
  const cluster = adminRuntime.cluster || {};
  const healthUp = String(adminRuntime.health?.status || "").toUpperCase() === "UP";
  return head("平台设置", "查看当前平台配置、数据来源和服务能力。", `<button class="secondary" data-action="refresh-admin-runtime">重新检查</button>`) +
    `<div class="admin-settings-grid"><section class="card"><div class="card-head"><h2>基础配置</h2></div><dl class="settings-list"><div><dt>平台名称</dt><dd>学生实践平台</dd></div><div><dt>数据结构版本</dt><dd>v${DATA_VERSION}</dd></div><div><dt>所属单位</dt><dd>${esc(store.settings.institution || "未配置")}</dd></div><div><dt>教师显示名称</dt><dd>${esc(store.settings.teacherName || "未配置")}</dd></div><div><dt>数据接口</dt><dd>${apiBase ? "同源 /api" : "浏览器本地模式"}</dd></div></dl></section><section class="card"><div class="card-head"><h2>服务能力</h2></div><dl class="settings-list"><div><dt>核心 API</dt><dd>${runtimeState(healthUp)}</dd></div><div><dt>代码文件</dt><dd>${runtimeState(true, "已启用", "未启用")}</dd></div><div><dt>交互终端</dt><dd>${runtimeState(Boolean(terminal.enabled), "已启用", "受限模式")}</dd></div><div><dt>实验运行适配器</dt><dd>${runtimeState(Boolean(adminRuntime.cloud?.configured), "已接入", "未接入")}</dd></div><div><dt>大数据集群</dt><dd>${runtimeState(Boolean(cluster.healthy), "运行中", cluster.configured ? "启动中" : "未部署")}</dd></div><div><dt>最后检查</dt><dd>${esc(formatTime(adminRuntime.checkedAt))}</dd></div></dl></section></div>` +
    (adminRuntime.errors.length ? `<section class="admin-warning"><strong>部分状态接口读取失败</strong><span>${esc(adminRuntime.errors.join("；"))}</span></section>` : "");
}

function render() {
  renderNav();
  let view;
  if (store.role === "teacher") {
    view = { home: teacherHome, courses: coursesPage, course: courseDetail, questions: questionBankPage, labs: labsPage, grading: gradingPage, settings: settingsPage }[store.page] || teacherHome;
  } else if (store.role === "student") {
    view = { home: studentHome, learning: studentLearningPage, "student-course": studentCourseDetailPage, practice: studentPracticePage, grades: studentGradesPage, records: studentRecordsPage }[store.page] || studentHome;
  } else {
    view = { home: adminOverviewPage, resources: adminResourcesPage, users: adminUsersPage, settings: adminSettingsPage }[store.page] || adminOverviewPage;
  }
  document.title = `学生实践平台 · ${configs[store.role].label}`;
  main.innerHTML = view();
}

function closeModal() {
  $("#modalBackdrop").hidden = true;
  $("#modalForm").innerHTML = "";
  $("#modalPanel").classList.remove("resource-viewer-modal");
}

function courseForm(course = {}) {
  const selectedModules = new Set(course.modules || ["plan", "notice", "lab", "resource", "analytics"]);
  return `<div class="form-grid">
    <div class="form-section first"><h3>基本信息</h3><p>先定义课程定位、培养目标和教学周期，再编排章节内容。</p></div>
    <div class="form-row full"><label>课程名称 *</label><input name="name" required maxlength="60" value="${esc(course.name)}" placeholder="例如：数据结构 2026 春季" /></div>
    <div class="form-row"><label>课程编号 *</label><input name="code" required maxlength="48" value="${esc(course.code)}" placeholder="例如：DS-2026-SPRING" /></div>
    <div class="form-row"><label>课程分类 *</label><select name="category" required><option value="" ${!course.category ? "selected" : ""}>请选择</option>${["计算机与信息技术", "人工智能", "软件工程", "数学与基础科学", "其他"].map((item) => `<option ${selected(course.category, item)}>${item}</option>`).join("")}</select></div>
    <div class="form-row"><label>难度</label><select name="difficulty">${["入门", "初级", "中级", "高级"].map((item) => `<option ${selected(course.difficulty || "初级", item)}>${item}</option>`).join("")}</select></div>
    <div class="form-row"><label>教学语言</label><select name="language">${["中文", "中英双语", "英文"].map((item) => `<option ${selected(course.language || "中文", item)}>${item}</option>`).join("")}</select></div>
    <div class="form-row"><label>所属单位</label><input name="institution" maxlength="120" value="${esc(course.institution || store.settings.institution)}" placeholder="学校或院系" /></div>
    <div class="form-row"><label>学期</label><input name="term" maxlength="40" value="${esc(course.term)}" placeholder="例如：2026 春季" /></div>
    <div class="form-row"><label>开课日期</label><input type="date" name="startDate" value="${esc(course.startDate)}" /></div>
    <div class="form-row"><label>结束日期</label><input type="date" name="endDate" value="${esc(course.endDate)}" /></div>
    <div class="form-row"><label>总学时</label><input type="number" min="0" max="9999" name="totalHours" value="${esc(course.totalHours)}" placeholder="32" /></div>
    <div class="form-row"><label>学分</label><input type="number" min="0" max="100" step="0.5" name="credits" value="${esc(course.credits)}" placeholder="2" /></div>
    <div class="form-row full"><label>课程目标 *</label><textarea name="learningObjectives" maxlength="1500" placeholder="说明学生完成课程后应掌握的知识、能力和成果">${esc(course.learningObjectives)}</textarea></div>
    <div class="form-row full"><label>课程简介 *</label><textarea name="summary" maxlength="1500" placeholder="说明课程内容与教学特色">${esc(course.summary)}</textarea></div>
    <div class="form-row"><label>适用对象</label><input name="targetAudience" maxlength="200" value="${esc(course.targetAudience)}" placeholder="例如：计算机类大二学生" /></div>
    <div class="form-row"><label>先修要求</label><input name="prerequisites" maxlength="300" value="${esc(course.prerequisites)}" placeholder="例如：程序设计基础" /></div>
    <div class="form-row"><label>课程标签</label><input name="tags" maxlength="200" value="${esc((course.tags || []).join("，"))}" placeholder="Linux，操作系统，实践" /></div>
    <div class="form-row"><label>课程负责人/教学团队</label><input name="teachingTeam" maxlength="200" value="${esc((course.teachingTeam || []).join("，"))}" placeholder="姓名以逗号分隔" /></div>
    <div class="form-row full"><label>课程封面地址</label><input type="url" name="coverUrl" maxlength="500" value="${esc(course.coverUrl)}" placeholder="https://...（可选）" /></div>
    <div class="form-section module-picker" id="modulePicker"><div class="section-title-row"><div><h3>课堂模块</h3><p>按类别筛选并启用课堂能力，已选模块会实时汇总。</p></div><div class="module-batch-actions"><button type="button" class="secondary" data-action="select-all-modules">全选</button><button type="button" class="secondary" data-action="clear-modules">清空</button></div></div><div class="module-category-tabs"><button type="button" class="active" data-action="module-filter" data-category="全部">全部</button>${Object.keys(moduleCategories).map((category) => `<button type="button" data-action="module-filter" data-category="${esc(category)}">${esc(category)}</button>`).join("")}</div><div class="module-selection-summary"><strong>已选 <span id="selectedModuleCount">${selectedModules.size}</span> 个模块</strong><div id="selectedModuleTags"></div></div><div class="check-grid">${moduleDefinitions.map(([id, label, description]) => `<label class="check-option" data-module-category="${esc(moduleCategory(id))}"><input type="checkbox" name="modules" value="${id}" ${checked(selectedModules.has(id))} /><span>${label}<small>${description}</small></span></label>`).join("")}</div></div>
    <div class="form-section"><h3>权限与加入方式</h3><p>课程发布后可发送至教学课堂，公开课程仍需申请审核。</p></div>
    <div class="form-row"><label>公开范围</label><select name="visibility"><option ${selected(course.visibility || "私有课程", "私有课程")}>私有课程</option><option ${selected(course.visibility, "公开课程")}>公开课程</option></select></div>
    <div class="form-row"><label>访问方式</label><select name="access">${["邀请码或邀请链接", "教师导入", "平台批量注册"].map((item) => `<option ${selected(course.access || "邀请码或邀请链接", item)}>${item}</option>`).join("")}</select></div>
    <label class="check-option compact"><input type="checkbox" name="allowExit" ${checked(course.allowExit !== false)} /><span>允许学生退出课堂</span></label>
    <label class="check-option compact"><input type="checkbox" name="showContacts" ${checked(course.showContacts)} /><span>向成员显示联系方式</span></label>
    <label class="check-option compact"><input type="checkbox" name="allowRoleApplication" ${checked(course.allowRoleApplication)} /><span>允许申请教师/助教</span></label>
    <label class="check-option compact"><input type="checkbox" name="digitalTextbookEnabled" ${checked(course.digitalTextbookEnabled)} /><span>启用数字教材</span></label>
    <div class="form-row full"><label>数字教材地址</label><input type="url" name="digitalTextbookUrl" maxlength="500" value="${esc(course.digitalTextbookUrl)}" placeholder="https://...（启用数字教材时填写）" /></div>
  </div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">${course.id ? "保存修改" : "创建课程"}</button></div>`;
}

function updateModulePicker() {
  const picker = $("#modulePicker");
  if (!picker) return;
  const selectedInputs = [...picker.querySelectorAll('input[name="modules"]:checked')];
  $("#selectedModuleCount", picker).textContent = selectedInputs.length;
  $("#selectedModuleTags", picker).innerHTML = selectedInputs.map((input) => `<button type="button" data-action="remove-module-tag" data-module-id="${esc(input.value)}">${esc(moduleLabel(input.value))}<span>×</span></button>`).join("") || `<span class="subtext">尚未选择模块</span>`;
}

function testEditorRow(test = {}, repositoryPaths = []) {
  const pathList = [...new Set([test.target || ".", ".", ...repositoryPaths])];
  const ruleType = test.ruleType || "file-exists";
  const expectedRequired = ["file-mode", "file-content-equals", "file-content-contains", "program-output-equals", "program-output-contains"].includes(ruleType);
  const expectedLabel = /^program-output-/.test(ruleType) ? "最终运行输出（正确答案）" : /^file-content-/.test(ruleType) ? "文件正确内容" : ruleType === "file-mode" ? "正确权限值" : "期望值（本规则无需填写）";
  const expectedHint = /^program-output-/.test(ruleType) ? "填写程序最后一次正确运行的完整输出结果，可多行" : /^file-content-/.test(ruleType) ? "填写文件应有的完整内容" : ruleType === "file-mode" ? "例如：600" : "此规则由系统自动判断";
  return `<div class="config-row evaluation-test-row">
    <input name="testName" maxlength="80" value="${esc(test.name)}" placeholder="测试名称" required />
    <select name="testVisibility"><option value="public" ${selected(test.visibility || "public", "public")}>公开测试</option><option value="hidden" ${selected(test.visibility, "hidden")}>隐藏测试</option></select>
    <select name="testRule"><option value="workspace-accessible" ${selected(ruleType, "workspace-accessible")}>工作目录可访问</option><option value="file-exists" ${selected(ruleType, "file-exists")}>文件存在</option><option value="file-mode" ${selected(ruleType, "file-mode")}>文件权限</option><option value="file-content-equals" ${selected(ruleType, "file-content-equals")}>文件内容完全相等</option><option value="file-content-contains" ${selected(ruleType, "file-content-contains")}>文件内容包含</option><option value="program-output-equals" ${selected(ruleType, "program-output-equals")}>程序输出完全相等</option><option value="program-output-contains" ${selected(ruleType, "program-output-contains")}>程序输出包含</option></select>
    <select name="testTarget" aria-label="评测文件">${pathList.map((path) => `<option value="${esc(path)}" ${selected(test.target || ".", path)}>${esc(path === "." ? "工作目录（.）" : path)}</option>`).join("")}</select>
    <label class="test-expected-field"><span>${expectedLabel}</span><textarea name="testExpected" maxlength="5000" placeholder="${expectedHint}" ${expectedRequired ? "required" : ""}>${esc(test.expected)}</textarea></label>
    <input name="testWeight" type="number" min="0" max="100" value="${esc(test.weight ?? 0)}" aria-label="权重" />
    <label class="inline-check"><input name="testRequired" type="checkbox" ${checked(test.required !== false)} />必做</label>
    <button type="button" class="link text-danger" data-action="remove-config-row">删除</button>
  </div>`;
}

function refreshTestExpectedField(ruleSelect) {
  const field = ruleSelect.closest(".evaluation-test-row")?.querySelector(".test-expected-field");
  const input = field?.querySelector('[name="testExpected"]');
  if (!field || !input) return;
  const ruleType = ruleSelect.value;
  const required = ["file-mode", "file-content-equals", "file-content-contains", "program-output-equals", "program-output-contains"].includes(ruleType);
  const label = /^program-output-/.test(ruleType) ? "最终运行输出（正确答案）" : /^file-content-/.test(ruleType) ? "文件正确内容" : ruleType === "file-mode" ? "正确权限值" : "期望值（本规则无需填写）";
  const hint = /^program-output-/.test(ruleType) ? "填写程序最后一次正确运行的完整输出结果，可多行" : /^file-content-/.test(ruleType) ? "填写文件应有的完整内容" : ruleType === "file-mode" ? "例如：600" : "此规则由系统自动判断";
  field.querySelector("span").textContent = label;
  input.placeholder = hint;
  input.required = required;
}

function answerEditorRow(answer = {}) {
  return `<div class="config-row reference-answer-row" data-answer-id="${esc(answer.id || uid("answer"))}"><input name="answerName" maxlength="60" value="${esc(answer.name)}" placeholder="答案名称，例如：本关标准答案" required /><textarea name="answerContent" maxlength="2000" placeholder="填写标准答案或分步提示，例如：把 __BLANK__ 替换为 trim">${esc(answer.content)}</textarea><label>查看后扣分 <input name="answerDeduction" type="number" min="0" max="100" value="${esc(answer.deductionPercent ?? 0)}" />%</label><button type="button" class="link text-danger" data-action="remove-config-row">删除</button></div>`;
}

function starterFileEditorRow(file = {}) {
  return `<div class="config-row starter-file-row"><input name="starterPath" maxlength="160" value="${esc(file.path || file.name)}" placeholder="目录/文件，例如 src/main.py" required /><textarea name="starterContent" maxlength="100000" placeholder="仓库文件内容">${esc(file.content)}</textarea><label class="inline-check"><input name="starterReadOnly" type="checkbox" ${checked(file.readOnly === true)} />学生只读</label><button type="button" class="link text-danger" data-action="remove-config-row">删除</button></div>`;
}

function formRepositoryPaths() {
  return [...document.querySelectorAll('.starter-file-row [name="starterPath"]')].map((input) => input.value.trim().replace(/\\/g, "/")).filter(Boolean);
}

function refreshRepositorySelectors() {
  const paths = formRepositoryPaths();
  document.querySelectorAll('.checkpoint-card [name="testTarget"]').forEach((selectNode) => {
    const current = selectNode.value || ".";
    const options = [...new Set([current, ".", ...paths])];
    selectNode.innerHTML = options.map((path) => `<option value="${esc(path)}" ${selected(current, path)}>${esc(path === "." ? "工作目录（.）" : path)}</option>`).join("");
  });
  document.querySelectorAll(".repository-file-picker").forEach((picker) => {
    const selectedPaths = new Set([...picker.querySelectorAll('input[name="studentFiles"]:checked')].map((input) => input.value));
    picker.innerHTML = paths.length ? paths.map((path) => `<label class="check-option"><input type="checkbox" name="studentFiles" value="${esc(path)}" ${checked(selectedPaths.has(path))} /><span>${esc(path)}</span></label>`).join("") : `<span class="subtext">请先添加仓库文件</span>`;
  });
}

function checkpointEditor(checkpoint = {}, index = 0, repositoryPaths = []) {
  const evaluation = normalizedEvaluation(checkpoint);
  const selectedFiles = new Set(evaluation.studentFiles || []);
  return `<section class="checkpoint-card" data-checkpoint-id="${esc(checkpoint.id || uid("checkpoint"))}">
    <div class="section-title-row"><div><h3>第 ${index + 1} 关 · ${esc(checkpoint.name || "未命名关卡")}</h3><p>任务说明、评测规则和成绩按关卡独立配置。</p></div><button type="button" class="link text-danger" data-action="remove-checkpoint">删除关卡</button></div>
    <div class="form-grid checkpoint-grid">
      <div class="form-row full"><label>关卡名称 *</label><input name="checkpointName" required maxlength="80" value="${esc(checkpoint.name || `第 ${index + 1} 关`)}" /></div>
      <div class="form-row"><label>难度</label><select name="difficulty">${["入门", "初级", "中级", "高级"].map((item) => `<option ${selected(checkpoint.difficulty || "初级", item)}>${item}</option>`).join("")}</select></div>
      <div class="form-row"><label>经验值</label><input type="number" name="rewardExperience" min="0" max="10000" value="${esc(checkpoint.rewardExperience || 0)}" /></div>
      <div class="form-row"><label>单次评测超时（秒）</label><input type="number" name="maxExecutionSeconds" min="1" max="120" value="${esc(checkpoint.maxExecutionSeconds || 8)}" /></div>
      <div class="form-row"><label>通过分数</label><input type="number" name="passingScore" min="1" max="100" value="${esc(evaluation.passingScore || 100)}" /></div>
      <div class="form-row full"><label>实验目标 *</label><textarea name="objectives" required maxlength="1500" placeholder="逐条说明学生完成本关后应掌握什么">${esc(checkpoint.objectives)}</textarea></div>
      <div class="form-row full"><label>任务说明 *</label><textarea name="description" required maxlength="4000" placeholder="说明任务背景、需要完成的内容和预期结果">${esc(checkpoint.description)}</textarea></div>
      <div class="form-row full"><label>相关知识</label><textarea name="knowledge" maxlength="3000">${esc(checkpoint.knowledge)}</textarea></div>
      <div class="form-row full"><label>学生实验要求（逐行填写） *</label><textarea name="requirements" required maxlength="3000" placeholder="每行一项：可修改文件、实现目标、限制条件、测试命令、验收标准">${esc(checkpoint.requirements)}</textarea><small>此内容会直接展示在学生实验页。建议至少写明：可修改文件、要实现的行为、不能改动的内容、测试命令和通过标准。</small></div>
      <div class="form-row full"><label>测试说明（学生可见）</label><textarea name="testDescription" maxlength="2000" placeholder="说明公开测试与隐藏测试分别关注的内容">${esc(checkpoint.testDescription)}</textarea></div>
      <div class="form-row"><label>通过策略</label><select name="passPolicy"><option value="all-required" ${selected(evaluation.passPolicy, "all-required")}>全部必做测试通过</option><option value="score-threshold" ${selected(evaluation.passPolicy, "score-threshold")}>达到分数线且必做项通过</option></select></div>
      <div class="form-row"><label>判分规则</label><select name="scoringRule"><option value="weighted" ${selected(evaluation.scoringRule || "weighted", "weighted")}>按测试权重</option><option value="test-count" ${selected(evaluation.scoringRule, "test-count")}>按通过测试数量</option><option value="all-or-nothing" ${selected(evaluation.scoringRule, "all-or-nothing")}>全对得分，否则 0 分</option></select></div>
      <div class="form-row"><label>空格处理</label><select name="whitespacePolicy"><option value="exact" ${selected(evaluation.whitespacePolicy || "exact", "exact")}>严格匹配</option><option value="trim-lines" ${selected(evaluation.whitespacePolicy, "trim-lines")}>忽略行首尾空格和末尾空行</option><option value="ignore-all" ${selected(evaluation.whitespacePolicy, "ignore-all")}>忽略全部空白字符</option></select></div>
      <label class="check-option compact"><input type="checkbox" name="caseSensitive" ${checked(evaluation.caseSensitive !== false)} /><span>区分大小写</span></label>
      <div class="form-row full"><label>评测输出文件（从代码仓库选择）</label><div class="check-grid repository-file-picker">${repositoryPaths.length ? repositoryPaths.map((path) => `<label class="check-option"><input type="checkbox" name="studentFiles" value="${esc(path)}" ${checked(selectedFiles.has(path))} /><span>${esc(path)}</span></label>`).join("") : `<span class="subtext">请先添加仓库文件</span>`}</div></div>
      <div class="form-row"><label>输出类型</label><select name="outputType"><option ${selected(evaluation.outputType, "文本结果")}>文本结果</option><option ${selected(evaluation.outputType, "文件结果")}>文件结果</option><option ${selected(evaluation.outputType, "图形效果")}>图形效果</option></select></div>
      <div class="form-row"><label>评测引擎</label><input value="平台内置安全评测器" disabled /><small>不执行教师自定义 Shell</small></div>
    </div>
    <div class="form-section checkpoint-section"><div class="section-title-row"><div><h3>测试集</h3><p>评测目标直接从代码仓库文件中选择。</p></div><button type="button" class="secondary" data-action="add-checkpoint-test">+ 添加测试</button></div><div class="config-list evaluation-tests">${evaluation.tests.map((test) => testEditorRow(test, repositoryPaths)).join("")}</div></div>
    <div class="form-section checkpoint-section"><div class="section-title-row"><div><h3>填空答案与提示：完整正确答案</h3><p>代码模板中含有 <code>__BLANK__</code> 时，必须填写补全后的完整正确代码。该内容仅教师可见；学生查看提示时只会获取下方单独配置的提示内容。</p></div></div><div class="form-row full"><label>完整正确答案</label><textarea name="fillBlankAnswer" maxlength="30000" placeholder="请粘贴补全 __BLANK__ 后的完整代码，不要只填写一个词或一行片段">${esc(evaluation.fillBlankAnswer || "")}</textarea></div><div class="section-title-row"><div><h3>可选提示与参考答案</h3><p>可配置分步提示；学生查看后将按设置扣分。自动判分仍以测试集为准。</p></div><button type="button" class="secondary" data-action="add-checkpoint-answer">+ 添加答案或提示</button></div><div class="config-list reference-answers">${evaluation.referenceAnswers.map(answerEditorRow).join("")}</div></div>
  </section>`;
}

function labPreset(preset) {
  const base = { mode: "仅命令行", duration: 60, builtIn: "linux-permissions", publicScope: "仅自己", repository: { branch: "main", commitMessage: "初始化实验仓库", files: [] } };
  if (preset === "python") return {
    ...base,
    name: "Python 基础编程实验",
    mode: "代码 + 命令行",
    techPlatform: "Python",
    language: "Python 3",
    skillTags: ["Python", "基础编程"],
    repository: { ...base.repository, files: [{ path: "main.py", content: "# 请完成程序并输出 Hello, 学生实践平台\n", readOnly: false }, { path: "README.md", content: "运行 python3 main.py 完成本关任务。\n", readOnly: true }] },
    checkpoints: [{ id: uid("checkpoint"), name: "输出第一行程序", difficulty: "入门", objectives: "掌握 Python 程序的编辑与运行方法。", description: "补全 main.py，使程序输出 Hello, 学生实践平台。", knowledge: "print 函数与字符串", requirements: "补全 main.py\n运行程序并检查输出\n通过自动评测", testDescription: "程序输出需包含 Hello, 学生实践平台。", evaluationConfig: { passPolicy: "all-required", scoringRule: "weighted", passingScore: 100, whitespacePolicy: "trim-lines", caseSensitive: true, studentFiles: ["main.py"], outputType: "文本结果", tests: [{ id: uid("test"), name: "程序输出检查", visibility: "public", ruleType: "program-output-contains", target: "main.py", expected: "Hello, 学生实践平台", weight: 100, required: true }], referenceAnswers: [{ id: uid("answer"), name: "编程提示", content: "使用 print('Hello, 学生实践平台') 输出文本。", deductionPercent: 20 }] } }],
  };
  return {
    ...base,
    name: "Linux 文件权限实验",
    techPlatform: "Linux",
    language: "Bash",
    skillTags: ["Linux", "文件权限"],
    repository: { ...base.repository, files: [{ path: "README.md", content: "使用 touch、chmod 和 stat 完成文件权限任务。\n", readOnly: true }] },
    checkpoints: [{ id: uid("checkpoint"), name: "创建文件并设置权限", difficulty: "初级", objectives: "掌握 Linux 文件创建、权限设置与查看方法。", description: "在实验工作目录创建 notes.txt，并将权限设置为仅所有者可读写。", knowledge: "touch、chmod、stat 命令", requirements: "创建 notes.txt\n将权限设置为 600\n使用 stat 检查权限", testDescription: "系统检查文件是否存在以及权限是否为 600。", evaluationConfig: defaultEvaluationConfig() }],
  };
}

function labForm(lab = {}) {
  const repository = normalizedRepository(lab);
  const checkpoints = normalizedCheckpoints(lab);
  const repositoryPaths = repository.files.map((file) => file.path || file.name).filter(Boolean);
  const repositoryHistory = (repository.commits || []).length ? `<div class="repository-history"><h4>提交历史</h4>${repository.commits.slice(0, 12).map((commit, index) => `<article><code>${esc(commit.shortId || String(commit.id || "").slice(0, 8))}</code><div><strong>${esc(commit.message || "未填写提交说明")}</strong><small>${esc(commit.author || "平台教师")} · ${esc(formatTime(commit.at))}</small></div>${index ? `<button type="button" class="link" data-action="view-repository-diff" data-id="${esc(lab.id)}" data-commit="${esc(commit.id)}">差异</button><button type="button" class="link text-danger" data-action="rollback-repository" data-id="${esc(lab.id)}" data-commit="${esc(commit.id)}">回滚</button>` : tag("当前版本")}</article>`).join("")}<pre id="repositoryDiff" class="repository-diff" hidden></pre></div>` : "";
  const quickStart = !lab.id ? `<div class="form-section first lab-quick-start"><div><span class="section-eyebrow">快速开始</span><h3>选择一个常用模板自动填写</h3><p>选择后仍可修改所有内容；如果熟悉配置，也可以直接从当前空白表单开始。</p></div><div class="lab-preset-grid"><button type="button" data-action="apply-lab-preset" data-preset="linux"><b>Linux 命令实验</b><small>文件、权限与 Shell 操作</small></button><button type="button" data-action="apply-lab-preset" data-preset="python"><b>Python 编程实验</b><small>代码、运行与输出评测</small></button></div><div class="lab-step-nav"><button type="button" data-action="jump-lab-section" data-target="labBasicSection">1 基本信息</button><button type="button" data-action="jump-lab-section" data-target="labRepositorySection">2 代码仓库</button><button type="button" data-action="jump-lab-section" data-target="labCheckpointSection">3 关卡与评测</button></div></div>` : `<div class="form-section first lab-edit-guide"><strong>创建流程：</strong>基本信息 → 代码仓库 → 关卡任务与评测标准。修改后保存会创建新的 Git 版本。</div>`;
  return `<div class="form-grid lab-builder">
    ${quickStart}
    <div id="labBasicSection" class="form-section lab-builder-heading"><span>第 1 步</span><h3>实验基本信息</h3><p>先确定学生使用方式和运行环境，其他高级信息可保持默认。</p></div>
    <div class="form-row full"><label>实验名称 *</label><input name="name" required maxlength="80" value="${esc(lab.name)}" placeholder="请输入实验名称" /></div>
    <div class="form-row"><label>学生操作模式</label><select name="mode">${["仅命令行", "代码 + 命令行"].map((item) => `<option ${selected(lab.mode === "网页桌面" ? "代码 + 命令行" : (lab.mode || "仅命令行"), item)}>${item}</option>`).join("")}</select></div>
    <div class="form-row"><label>最大执行时长（分钟）</label><input type="number" name="duration" min="5" max="120" required value="${esc(Math.min(120, Number(lab.duration || 120)))}" /><small>隔离环境按模板时长回收，最长 120 分钟</small></div>
    <div class="form-row full"><label>运行环境 *</label><select name="builtIn" required><option value="linux-permissions" ${selected(lab.builtIn || "linux-permissions", "linux-permissions")}>内置多语言 Docker 隔离环境（推荐）</option></select><small>包含 Linux、Python、Java、数据库工具、代码文件与命令行能力。</small></div>
    <div class="form-row"><label>技术平台</label><select name="techPlatform"><option ${selected(lab.techPlatform || "Linux", "Linux")}>Linux</option><option ${selected(lab.techPlatform, "Java")}>Java</option><option ${selected(lab.techPlatform, "Python")}>Python</option><option ${selected(lab.techPlatform, "数据库")}>数据库</option></select></div>
    <div class="form-row"><label>主要语言/工具</label><input name="language" maxlength="80" value="${esc(lab.language || "Bash")}" placeholder="Bash、Java、Python..." /></div>
    <div class="form-row full"><label>公开范围</label><select name="publicScope"><option ${selected(lab.publicScope || "仅自己", "仅自己")}>仅自己</option><option ${selected(lab.publicScope, "本单位可用")}>本单位可用</option><option ${selected(lab.publicScope, "申请公开")}>申请公开</option></select></div>
    <div class="form-row"><label>技能标签</label><input name="skillTags" maxlength="200" value="${esc((lab.skillTags || []).join("，"))}" placeholder="Linux，权限管理" /></div>
    <div id="labRepositorySection" class="form-section lab-builder-section"><div class="section-title-row"><div><span class="step-number">第 2 步</span><h3>准备代码仓库</h3><p>${repository.storage === "git" ? `真实 ${esc(repository.provider || "Git")} 仓库 · ${esc(String(repository.headCommit || "").slice(0, 8))}` : "保存后自动创建真实 Git 仓库"}。添加学生进入实验时需要看到的文件；路径可包含多级目录。</p><p><b>代码填空题：</b>教师可直接修改下方代码模板，在文件顶部写题目与提示，并在学生可编辑文件中保留 <code>__BLANK__</code>；只读的 verify 文件用于定义判分规则。</p></div><button type="button" class="secondary" data-action="add-starter-file">+ 添加仓库文件</button></div><div class="form-row"><label>默认分支</label><input name="repositoryBranch" value="${esc(repository.defaultBranch || repository.branch)}" maxlength="80" /></div><div class="form-row"><label>本次提交说明</label><input name="commitMessage" value="${esc(repository.commitMessage)}" maxlength="200" placeholder="说明本次修改内容" /></div><div id="starterFiles" class="config-list">${repository.files.map(starterFileEditorRow).join("") || starterFileEditorRow({ path: lab.techPlatform === "Python" ? "main.py" : lab.techPlatform === "数据库" ? "main.sql" : lab.techPlatform === "Java" ? "Main.java" : "README.md" })}</div>${repositoryHistory}</div>
    <div id="labCheckpointSection" class="form-section lab-builder-section"><div class="section-title-row"><div><span class="step-number">第 3 步</span><h3>设计关卡与通过标准</h3><p>每个关卡依次填写“学生要做什么”和“系统怎样判断通过”。首次创建建议只保留一个关卡。</p></div><button type="button" class="primary" data-action="add-checkpoint">+ 添加关卡</button></div><div class="lab-builder-tip"><b>最低完成条件</b><span>关卡名称、实验目标、任务说明、操作要求，以及至少一条自动测试。</span></div><div id="checkpointList" class="checkpoint-list">${checkpoints.map((checkpoint, index) => checkpointEditor(checkpoint, index, repositoryPaths)).join("")}</div></div>
  </div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">${lab.id ? "保存修改" : "保存为草稿"}</button></div>`;
}

function reportLabFormIssue(node, message) {
  node?.scrollIntoView({ behavior: "smooth", block: "center" });
  node?.focus();
  toast(message);
  return false;
}

function lectureForm(courseId, lecture = {}) {
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="lectureId" value="${esc(lecture.id)}" /><div class="form-grid"><div class="form-row full"><label>讲次名称 *</label><input name="name" required maxlength="100" value="${esc(lecture.name)}" placeholder="例如：第 1 讲 Linux 文件与权限" /></div><div class="form-row"><label>授课时间</label><input type="datetime-local" name="scheduledAt" value="${esc(lecture.scheduledAt)}" /></div><div class="form-row"><label>教学方式</label><select name="mode"><option ${selected(lecture.mode || "线上线下混合", "线上线下混合")}>线上线下混合</option><option ${selected(lecture.mode, "线上")}>线上</option><option ${selected(lecture.mode, "线下")}>线下</option></select></div><div class="form-row full"><label>讲次说明</label><textarea name="description" maxlength="1000" placeholder="说明本讲内容和学习安排">${esc(lecture.description)}</textarea></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存讲次</button></div>`;
}

function memberForm(courseId, member = {}) {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="memberId" value="${esc(member.id)}" /><div class="form-grid"><div class="form-row full"><label>${member.id ? "成员姓名" : "成员姓名（可每行一人）"} *</label><textarea name="names" required maxlength="2000" placeholder="张三&#10;李四">${esc(member.name)}</textarea></div><div class="form-row"><label>角色</label><select name="role">${["教师", "助教", "学生", "合作者"].map((role) => `<option ${selected(member.role || "学生", role)}>${role}</option>`).join("")}</select></div><div class="form-row"><label>所属班级</label><select name="classId"><option value="">未分班</option>${course.sections.map((section) => `<option value="${esc(section.id)}" ${selected(member.classId, section.id)}>${esc(section.name)}</option>`).join("")}</select></div><div class="form-row"><label>状态</label><select name="status"><option ${selected(member.status || "正常", "正常")}>正常</option><option ${selected(member.status, "已停用")}>已停用</option></select></div><div class="form-row"><label>学号/工号</label><input name="identifier" maxlength="80" value="${esc(member.identifier)}" /></div><div class="form-row"><label>邮箱</label><input type="email" name="email" maxlength="160" value="${esc(member.email)}" /></div><div class="form-row full"><label>备注</label><input name="note" maxlength="300" value="${esc(member.note)}" /></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">${member.id ? "保存成员" : "添加成员"}</button></div>`;
}

function sectionForm(courseId, section = {}) {
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="sectionId" value="${esc(section.id)}" /><div class="form-grid"><div class="form-row full"><label>班级名称 *</label><input name="name" required maxlength="100" value="${esc(section.name)}" placeholder="例如：软件工程 1 班" /></div><div class="form-row"><label>班级编号</label><input name="code" maxlength="60" value="${esc(section.code)}" /></div><div class="form-row"><label>负责教师</label><input name="teacherName" maxlength="80" value="${esc(section.teacherName || store.settings.teacherName)}" /></div><div class="form-row full"><label>班级说明</label><textarea name="description" maxlength="1000">${esc(section.description)}</textarea></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存班级</button></div>`;
}

function roleApplicationForm(courseId) {
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><div class="form-grid"><div class="form-section first"><h3>申请教学角色</h3><p>申请提交后由课程教师审核，通过后获得相应课堂管理权限。</p></div><div class="form-row"><label>申请角色</label><select name="requestedRole"><option>助教</option><option>教师</option></select></div><div class="form-row full"><label>申请说明 *</label><textarea name="reason" required maxlength="1000" placeholder="请说明申请原因和可承担的教学工作"></textarea></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">提交申请</button></div>`;
}

function resourceForm(courseId, resource = {}) {
  const types = ["教学资料", "视频", "外部链接", "图文作业", "编程作业", "在线考试", "互动讨论", "虚拟仿真"];
  const history = (resource.versions || []).map((version) => `<li><b>${esc(version.label || version.name)}</b><span>${esc(version.name)} · ${esc(formatTime(version.uploadedAt))}</span></li>`).join("");
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="resourceId" value="${esc(resource.id)}" /><div class="form-grid"><div class="form-row full"><label>资源名称 *</label><input name="name" required maxlength="120" value="${esc(resource.name)}" /></div><div class="form-row"><label>资源类型</label><select name="type">${types.map((type) => `<option ${selected(resource.type || "教学资料", type)}>${type}</option>`).join("")}</select></div><div class="form-row"><label>资源目录</label><input name="folder" maxlength="120" value="${esc(resource.folder || "课程资料")}" placeholder="例如：第一章/课件" /></div><div class="form-row"><label>子任务数量</label><input type="number" min="1" max="999" name="subtasks" value="${esc(resource.subtasks || 1)}" /></div><div class="form-row full"><label>上传教学文件（最大 10 MiB）</label><input type="file" name="resourceFile" /><small>${resource.fileName ? `当前文件：${esc(resource.fileName)}` : "可上传 PDF、文档、课件、图片、视频或压缩包"}</small></div><div class="form-row"><label>新版本说明</label><input name="versionLabel" maxlength="120" placeholder="例如：v2 修订练习题" /></div><div class="form-row full"><label>外部资源地址</label><input type="url" name="url" maxlength="1000" value="${esc(resource.url)}" placeholder="未上传文件时可填写 https://..." /></div><div class="form-row full"><label>资源说明</label><textarea name="description" maxlength="1500">${esc(resource.description)}</textarea></div>${history ? `<div class="form-section"><h3>历史版本</h3><ul class="module-list">${history}</ul></div>` : ""}</div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存资源</button></div>`;
}

async function uploadResourceFile(file) {
  if (!file) return null;
  if (!apiBase) throw new Error("请通过本地 HTTP 服务运行平台后再上传文件");
  if (file.size > 10 * 1024 * 1024) throw new Error("教学文件不能超过 10 MiB");
  const contentBase64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("文件读取失败")); reader.onload = () => resolve(String(reader.result || "").split(",")[1] || ""); reader.readAsDataURL(file); });
  const response = await fetch(`${apiBase}/uploads`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, mimeType: file.type, contentBase64 }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "教学文件上传失败");
  return body;
}

function knowledgeForm(courseId, point = {}) {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="knowledgeId" value="${esc(point.id)}" /><div class="form-grid"><div class="form-row full"><label>知识点名称 *</label><input name="name" required maxlength="100" value="${esc(point.name)}" /></div><div class="form-row"><label>知识点编号</label><input name="code" maxlength="40" value="${esc(point.code)}" placeholder="例如：K-01" /></div><div class="form-row"><label>前置知识点</label><select name="prerequisiteId"><option value="">无前置知识点</option>${course.knowledgePoints.filter((item) => item.id !== point.id).map((item) => `<option value="${esc(item.id)}" ${selected(point.prerequisiteId, item.id)}>${esc(item.name)}</option>`).join("")}</select></div><div class="form-row full"><label>知识点说明</label><textarea name="description" maxlength="1500">${esc(point.description)}</textarea></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存知识点</button></div>`;
}

function questionForm(question = {}) {
  const supportedTypes = ["单选题", "多选题", "判断题", "填空题", "简答题"];
  const type = supportedTypes.includes(question.type) ? question.type : question.type ? "简答题" : "单选题";
  return `<div class="form-grid question-form"><div class="form-section first"><h3>题目内容</h3><p>填写题干、答案和解析，保存后可直接复用到试卷。</p></div><div class="form-row"><label>题型 *</label><select name="questionType">${supportedTypes.map((item) => `<option ${selected(type, item)}>${item}</option>`).join("")}</select></div><div class="form-row"><label>难度</label><select name="difficulty">${["简单", "中等", "困难"].map((value) => `<option ${selected(question.difficulty || "简单", value)}>${value}</option>`).join("")}</select></div><div class="form-row full"><label>题干 *</label><textarea name="stem" required maxlength="10000" placeholder="请输入题目内容">${esc(question.stem)}</textarea></div><div id="questionAnswerEditor" class="form-section question-answer-editor" data-question-type="${esc(type)}">${questionAnswerEditor(type, question)}</div><div class="form-row full"><label>答案解析</label><textarea name="explanation" maxlength="10000" placeholder="选填：说明知识点和解题过程">${esc(question.explanation)}</textarea></div><div class="form-row question-score-row"><label>默认分值</label><input type="number" name="defaultScore" min="1" max="1000" value="${esc(question.defaultScore || 5)}" /></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存题目</button></div>`;
}

function questionOptionRow(option = {}, index = 0, type = "单选题", selectedAnswers = new Set()) {
  const key = String.fromCharCode(65 + index);
  const inputType = type === "多选题" ? "checkbox" : "radio";
  return `<div class="question-option-row"><label class="question-answer-choice" title="设为正确答案"><input type="${inputType}" name="questionCorrectOption" value="${key}" ${checked(selectedAnswers.has(String(option.key || key).toLowerCase()))} /><span>${key}</span></label><input type="hidden" name="questionOptionKey" value="${key}" /><input class="question-option-text" name="questionOptionText" required maxlength="1000" value="${esc(option.text)}" placeholder="请输入选项内容" /><button type="button" class="question-option-remove" data-action="remove-question-option" aria-label="删除选项" title="删除选项">×</button></div>`;
}

function questionAnswerEditor(type, question = {}) {
  const answers = new Set(normalizeAnswer(question.answers || []));
  if (["单选题", "多选题"].includes(type)) {
    const existing = parseQuestionOptions(question.options || []);
    const options = existing.length ? existing : Array.from({ length: 4 }, (_, index) => ({ key: String.fromCharCode(65 + index), text: "" }));
    return `<div class="section-title-row question-options-title"><div><h3>答案选项 *</h3><p>${type === "单选题" ? "点击选项前的圆点设置唯一正确答案。" : "勾选一个或多个正确答案。"}</p></div><button type="button" class="secondary" data-action="add-question-option">+ 添加选项</button></div><div id="questionOptionList" class="question-option-list">${options.map((option, index) => questionOptionRow(option, index, type, answers)).join("")}</div>`;
  }
  if (type === "判断题") {
    const answer = answers.has("b") ? "B" : "A";
    return `<h3>正确答案 *</h3><div class="question-judge-options"><label class="check-option"><input type="radio" name="questionCorrectOption" value="A" ${checked(answer === "A")} required /><span>正确</span></label><label class="check-option"><input type="radio" name="questionCorrectOption" value="B" ${checked(answer === "B")} /><span>错误</span></label></div>`;
  }
  const answerText = (question.answers || []).join("\n");
  const label = type === "填空题" ? "完整正确答案 *" : "参考答案 *";
  const hint = type === "填空题" ? "填写学生应提交的完整正确答案；如确有多个等价完整答案，每行填写一个" : "请输入供教师阅卷参考的答案";
  return `<div class="form-row full"><label>${label}</label><textarea name="answers" required maxlength="5000" placeholder="${hint}">${esc(answerText)}</textarea></div>`;
}

function currentQuestionOptionDraft() {
  return [...document.querySelectorAll("#questionOptionList .question-option-row")].map((row, index) => ({
    key: String.fromCharCode(65 + index),
    text: row.querySelector('[name="questionOptionText"]')?.value || "",
    selected: Boolean(row.querySelector('[name="questionCorrectOption"]')?.checked),
  }));
}

function reindexQuestionOptions() {
  document.querySelectorAll("#questionOptionList .question-option-row").forEach((row, index) => {
    const key = String.fromCharCode(65 + index);
    const badge = row.querySelector(".question-answer-choice span");
    const answer = row.querySelector('[name="questionCorrectOption"]');
    const hidden = row.querySelector('[name="questionOptionKey"]');
    if (badge) badge.textContent = key;
    if (answer) answer.value = key;
    if (hidden) hidden.value = key;
  });
}

function refreshQuestionAnswerEditor(type) {
  const editor = $("#questionAnswerEditor");
  if (!editor) return;
  const previousType = editor.dataset.questionType || "";
  const draft = currentQuestionOptionDraft();
  const options = draft.map(({ key, text }) => ({ key, text }));
  const selectedOptions = draft.filter((item) => item.selected).map((item) => item.key);
  const existingTextAnswer = editor.querySelector('[name="answers"]')?.value || "";
  const subjectiveTypes = new Set(["填空题", "简答题"]);
  const answers = subjectiveTypes.has(type) && subjectiveTypes.has(previousType) ? splitList(existingTextAnswer) : selectedOptions;
  editor.innerHTML = questionAnswerEditor(type, {
    options,
    answers,
  });
  editor.dataset.questionType = type;
}

function activityForm(courseId, kind, item = {}) {
  const labels = { notice: "通知公告", assignment: "作业", exam: "考试", discussion: "讨论" };
  const typeOptions = kind === "assignment" ? ["图文作业", "编程作业", "分组作业"] : kind === "exam" ? ["在线考试", "随堂测验"] : [labels[kind]];
  const references = new Set((item.labReferences || []).map((reference) => typeof reference === "string" ? reference : `${reference.labId}:${reference.checkpointId}`));
  const questionRefs = new Map((item.questionRefs || []).map((reference) => [reference.questionId, reference]));
  const questionPicker = kind === "exam" ? `<div class="form-section"><h3>题库组卷</h3><p>勾选题目进行手动组卷；也可以设置随机抽题数量，保存时从当前可用题库补足。</p><div class="form-row"><label>随机抽题数量</label><input type="number" name="randomQuestionCount" min="0" max="200" value="0" /></div><div class="check-grid exam-question-picker">${store.questionBank.map((question) => { const reference = questionRefs.get(question.id); return `<label class="check-option"><input type="checkbox" name="questionIds" value="${esc(question.id)}" ${checked(Boolean(reference))} /><span>${esc(question.type)} · ${esc(question.stem)}<small>${esc(question.difficulty)} · 分值 <input type="number" name="questionScore-${esc(question.id)}" min="1" max="1000" value="${esc(reference?.score || question.defaultScore || 5)}" /></small></span></label>`; }).join("") || `<span class="subtext">题库为空，请先到“题库与组卷”创建题目。</span>`}</div></div>` : "";
  const labPicker = kind === "exam" ? `<div class="form-section"><h3>复用实践项目到试卷</h3><p>可将已发布实验的整关直接作为实操题，学生进入原实验环境完成并自动判分。</p><div class="check-grid exam-lab-picker">${store.labs.filter((lab) => lab.state === "已发布").flatMap((lab) => normalizedCheckpoints(lab).map((checkpoint, index) => {
    const value = `${lab.id}:${checkpoint.id}`;
    return `<label class="check-option"><input type="checkbox" name="labReferences" value="${esc(value)}" ${checked(references.has(value))} /><span>${esc(lab.name)}<small>第 ${index + 1} 关 · ${esc(checkpoint.name)}</small></span></label>`;
  })).join("") || `<span class="subtext">暂无已发布实践项目，请先发布实验模板。</span>`}</div></div>` : "";
  const examSettings = kind === "exam" ? `<div class="form-row"><label>开始时间</label><input type="datetime-local" name="startAt" value="${esc(item.startAt)}" /></div><div class="form-row"><label>考试时长（分钟）</label><input type="number" name="durationMinutes" min="1" max="1440" value="${esc(item.durationMinutes || 60)}" /></div><div class="form-row"><label>允许作答次数</label><input type="number" name="maxAttempts" min="1" max="20" value="${esc(item.maxAttempts || 1)}" /></div><label class="check-option compact"><input type="checkbox" name="shuffleQuestions" ${checked(item.shuffleQuestions)} /><span>学生端随机题序</span></label><label class="check-option compact"><input type="checkbox" name="showAnswersAfterClose" ${checked(item.showAnswersAfterClose)} /><span>结束后显示答案解析</span></label>` : "";
  const assignmentSettings = kind === "assignment" ? `<div class="form-row"><label>允许提交次数</label><input type="number" name="maxAttempts" min="1" max="20" value="${esc(item.maxAttempts || 1)}" /></div><div class="form-row"><label>分组人数上限</label><input type="number" name="groupSize" min="1" max="20" value="${esc(item.groupSize || (item.type === "分组作业" ? 5 : 1))}" /></div><label class="check-option compact"><input type="checkbox" name="allowLate" ${checked(item.allowLate)} /><span>允许截止后补交</span></label><label class="check-option compact"><input type="checkbox" name="attachmentRequired" ${checked(item.attachmentRequired)} /><span>必须提交附件/作品地址</span></label><label class="check-option compact"><input type="checkbox" name="plagiarismCheck" ${checked(item.plagiarismCheck)} /><span>启用文本相似度检查</span></label><label class="check-option compact"><input type="checkbox" name="peerReview" ${checked(item.peerReview)} /><span>启用学生互评</span></label><label class="check-option compact"><input type="checkbox" name="anonymousReview" ${checked(item.anonymousReview)} /><span>互评时匿名</span></label>` : "";
  const contentFields = kind === "assignment"
    ? `<div class="form-section assignment-authoring"><h3>作业任务</h3><p>学生端将按以下内容展示任务，请完整填写后再发布。</p><div class="form-row full"><label>作业内容 *</label><textarea name="description" required maxlength="10000" placeholder="说明题目、背景、需要完成的任务和预期成果">${esc(item.description)}</textarea></div><div class="form-row full"><label>作业要求</label><textarea name="requirements" maxlength="5000" placeholder="例如：完成哪些步骤、格式要求、评分关注点">${esc(item.requirements)}</textarea></div><div class="form-row full"><label>提交说明</label><textarea name="submissionInstructions" maxlength="3000" placeholder="例如：提交文字报告和代码仓库地址，文件命名为学号-姓名">${esc(item.submissionInstructions)}</textarea></div><div class="form-row full"><label>作业附件（最大 10 MiB）</label><input type="file" name="assignmentFile" /><small>${item.assignmentAttachmentName ? `当前附件：${esc(item.assignmentAttachmentName)}` : "可上传任务书、数据集、模板或参考资料"}</small></div><div class="form-row full"><label>参考资料地址</label><input type="url" name="referenceUrl" maxlength="1000" value="${esc(item.referenceUrl)}" placeholder="https://...（可选）" /></div></div>`
    : `<div class="form-row full"><label>${kind === "exam" ? "考试说明" : kind === "notice" ? "通知内容" : "讨论内容"}</label><textarea name="description" maxlength="3000">${esc(item.description)}</textarea></div>`;
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="itemId" value="${esc(item.id)}" /><input type="hidden" name="kind" value="${esc(kind)}" /><div class="form-grid"><div class="form-row full"><label>标题 *</label><input name="title" required maxlength="120" value="${esc(item.title)}" /></div><div class="form-row"><label>类型</label><select name="type">${typeOptions.map((type) => `<option ${selected(item.type || typeOptions[0], type)}>${type}</option>`).join("")}</select></div><div class="form-row"><label>${kind === "notice" || kind === "discussion" ? "发布时间" : "截止时间"}</label><input type="datetime-local" name="dueAt" value="${esc(item.dueAt || item.publishedAt)}" /></div>${kind === "assignment" || kind === "exam" ? `<div class="form-row"><label>总分</label><input type="number" name="totalScore" min="1" max="1000" value="${esc(item.totalScore || 100)}" /></div>` : ""}${examSettings}${assignmentSettings}${contentFields}${questionPicker}${labPicker}</div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存${labels[kind]}</button></div>`;
}

function assignmentGroupForm(courseId, group = {}) {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  const selectedMembers = new Set(group.memberIds || []);
  const groupAssignments = course.assignments.filter((item) => item.type === "分组作业");
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="groupId" value="${esc(group.id)}" /><div class="form-grid"><div class="form-row full"><label>小组名称 *</label><input name="name" required maxlength="80" value="${esc(group.name)}" placeholder="例如：第 1 组" /></div><div class="form-row full"><label>所属分组作业 *</label><select name="assignmentId" required><option value="">请选择</option>${groupAssignments.map((assignment) => `<option value="${esc(assignment.id)}" ${selected(group.assignmentId, assignment.id)}>${esc(assignment.title)}（最多 ${esc(assignment.groupSize || 5)} 人）</option>`).join("")}</select></div><div class="form-section"><h3>选择组员</h3><p>同一项作业中，每名学生只能加入一个小组。</p><div class="check-grid resource-check-grid">${course.members.filter((member) => member.role === "学生").map((member) => { const memberId = member.accountId || member.id; return `<label class="check-option"><input type="checkbox" name="memberIds" value="${esc(memberId)}" ${checked(selectedMembers.has(memberId))} /><span>${esc(member.name)}<small>${esc(member.identifier || memberId)}</small></span></label>`; }).join("") || `<span class="subtext">请先添加学生成员。</span>`}</div></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存小组</button></div>`;
}

function messageForm(courseId) {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  const recipients = store.role === "student" ? [{ id: "course-teachers", name: "课程教师" }] : [{ id: "all-students", name: "全体学生" }, ...course.members.filter((member) => member.role === "学生").map((member) => ({ id: member.accountId || member.id, name: member.name }))];
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><div class="form-grid"><div class="form-row full"><label>收件人 *</label><select name="recipientId" required>${recipients.map((recipient) => `<option value="${esc(recipient.id)}">${esc(recipient.name)}</option>`).join("")}</select></div><div class="form-row full"><label>主题 *</label><input name="subject" required maxlength="120" /></div><div class="form-row full"><label>消息内容 *</label><textarea name="content" required maxlength="5000"></textarea></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">发送消息</button></div>`;
}

function moduleItemForm(courseId, item = {}, presetModuleId = "") {
  const course = ensureCourseCollections(store.courses.find((entry) => entry.id === courseId) || {});
  const enabled = extensionModuleIds.filter((id) => course.modules.includes(id));
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="itemId" value="${esc(item.id)}" /><div class="form-grid"><div class="form-row"><label>所属模块</label><select name="moduleId">${enabled.map((id) => `<option value="${esc(id)}" ${selected(item.moduleId || presetModuleId || enabled[0], id)}>${esc(moduleLabel(id))}</option>`).join("")}</select></div><div class="form-row"><label>开放时间</label><input type="datetime-local" name="scheduledAt" value="${esc(item.scheduledAt)}" /></div><div class="form-row full"><label>内容标题 *</label><input name="title" required maxlength="120" value="${esc(item.title)}" /></div><div class="form-row full"><label>服务或内容地址</label><input type="url" name="url" maxlength="1000" value="${esc(item.url)}" placeholder="直播、AI 或外部服务模块发布前必须配置 URL" /></div><div class="form-row"><label>完成方式</label><select name="completionRule"><option ${selected(item.completionRule || "学生确认完成", "学生确认完成")}>学生确认完成</option><option ${selected(item.completionRule, "访问即完成")}>访问即完成</option><option ${selected(item.completionRule, "教师确认")}>教师确认</option></select></div><div class="form-row"><label>子任务数量</label><input type="number" name="subtasks" min="1" max="999" value="${esc(item.subtasks || 1)}" /></div><div class="form-row full"><label>内容说明</label><textarea name="description" maxlength="3000">${esc(item.description)}</textarea></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存模块内容</button></div>`;
}

function questionAnswerFields(question, existingAnswer) {
  const selectedAnswers = new Set(normalizeAnswer(existingAnswer));
  const options = parseQuestionOptions(question.options || (question.type === "判断题" ? [{ key: "A", text: "正确" }, { key: "B", text: "错误" }] : []));
  if (["单选题", "判断题"].includes(question.type)) return `<div class="check-grid">${options.map((option, index) => `<label class="check-option"><input type="radio" name="answer-${esc(question.id)}" value="${esc(option.key)}" ${checked(selectedAnswers.has(option.key.toLowerCase()))} ${index === 0 ? "required" : ""} /><span>${esc(option.key)}. ${esc(option.text)}</span></label>`).join("")}</div>`;
  if (question.type === "多选题") return `<div class="check-grid">${options.map((option) => `<label class="check-option"><input type="checkbox" name="answer-${esc(question.id)}" value="${esc(option.key)}" ${checked(selectedAnswers.has(option.key.toLowerCase()))} /><span>${esc(option.key)}. ${esc(option.text)}</span></label>`).join("")}</div>`;
  return `<textarea name="answer-${esc(question.id)}" maxlength="10000" placeholder="请输入答案" required>${esc(Array.isArray(existingAnswer) ? existingAnswer.join("\n") : existingAnswer || "")}</textarea>`;
}

function assignmentAttachmentDownloadUrl(courseId, task) {
  if (!task?.assignmentAttachmentUrl) return "";
  if (!apiBase) return task.assignmentAttachmentUrl;
  return `${apiBase}/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(task.id)}/attachment`;
}

function submissionForm(courseId, activityId, kind) {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  const collection = kind === "exam" ? course.exams : course.assignments;
  const task = collection.find((item) => item.id === activityId) || {};
  const group = task.type === "分组作业" ? course.assignmentGroups.find((item) => item.assignmentId === activityId && (item.memberIds || []).includes(currentStudentId())) : null;
  const submissionIdentity = group ? `group:${group.id}` : currentStudentId();
  const existing = course.submissions.find((item) => item.activityId === activityId && (item.studentId === submissionIdentity || item.groupId === group?.id)) || {};
  const labs = (task.labReferences || []).map((reference) => {
    const [labId, checkpointId] = typeof reference === "string" ? reference.split(":") : [reference.labId, reference.checkpointId];
    const commitSha = typeof reference === "string" ? "" : reference.commitSha || "";
    const lab = store.labs.find((entry) => entry.id === labId);
    const checkpoint = lab && normalizedCheckpoints(lab).find((entry) => entry.id === checkpointId);
    return lab && checkpoint ? `<button type="button" class="secondary" data-action="open-exam-lab" data-lab-id="${esc(lab.id)}" data-checkpoint-id="${esc(checkpoint.id)}" data-commit-sha="${esc(commitSha)}" data-course-id="${esc(courseId)}" data-activity-id="${esc(activityId)}">进入 ${esc(lab.name)} · ${esc(checkpoint.name)}</button>` : "";
  }).join("");
  const questions = kind === "exam" ? examQuestions(task) : [];
  const questionFields = questions.map(({ reference, question }, index) => `<div class="form-section"><h3>${index + 1}. ${esc(question.stem)} <small>${esc(reference.score || question.defaultScore || 0)} 分 · ${esc(question.type)}</small></h3>${questionAnswerFields(question, existing.answers?.[question.id])}</div>`).join("");
  const contentField = questions.length ? `<input type="hidden" name="content" value="在线答题（${questions.length} 题）" />` : `<div class="form-row full"><label>${kind === "exam" ? "答题内容" : "提交内容"} *</label><textarea name="content" required maxlength="10000" placeholder="请输入本次提交内容">${esc(existing.content)}</textarea></div>`;
  const submissionPolicy = kind === "assignment" ? `<p>截止：${esc(task.dueAt || "未设置")} · 最多提交 ${esc(task.maxAttempts || 1)} 次 · ${task.allowLate ? "允许补交" : "截止后不可提交"}${task.plagiarismCheck ? " · 启用相似度检查" : ""}</p>` : "";
  const groupNotice = task.type === "分组作业" ? `<div class="form-section"><h3>作业小组</h3><p>${group ? `${esc(group.name)} · 组员：${esc((group.memberNames || []).join("、"))}` : "你尚未加入该作业的小组，请联系教师分组后再提交。"}</p></div>` : "";
  const assignmentDownloadUrl = assignmentAttachmentDownloadUrl(courseId, task);
  const assignmentDetails = kind === "assignment" ? `<div class="assignment-task-details"><div><b>作业内容</b><p>${esc(task.description || "教师尚未填写作业内容")}</p></div>${task.requirements ? `<div><b>作业要求</b><p>${esc(task.requirements)}</p></div>` : ""}${task.submissionInstructions ? `<div><b>提交说明</b><p>${esc(task.submissionInstructions)}</p></div>` : ""}${assignmentDownloadUrl ? `<a href="${esc(assignmentDownloadUrl)}" download="${esc(task.assignmentAttachmentName || "作业资料")}">下载作业附件：${esc(task.assignmentAttachmentName || "作业资料")}</a>` : ""}${task.referenceUrl ? `<a href="${esc(task.referenceUrl)}" target="_blank" rel="noopener">查看参考资料</a>` : ""}</div>` : `<p>${esc(task.description || "请按要求完成并提交。")}</p>`;
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="activityId" value="${esc(activityId)}" /><input type="hidden" name="kind" value="${esc(kind)}" /><input type="hidden" name="groupId" value="${esc(group?.id || "")}" /><div class="form-grid"><div class="form-section first"><h3>${esc(task.title || "学习任务")}</h3>${assignmentDetails}${submissionPolicy}${labs ? `<div class="button-row exam-lab-actions">${labs}</div>` : ""}</div>${groupNotice}${questionFields}${contentField}<div class="form-row full"><label>附件或作品地址${task.attachmentRequired ? " *" : ""}</label><input type="url" name="attachmentUrl" maxlength="1000" value="${esc(existing.attachmentUrl)}" placeholder="https://...（可选）" ${task.attachmentRequired ? "required" : ""} /></div>${existing.status === "已批阅" || existing.status === "需重做" ? `<div class="form-section"><h3>教师反馈</h3><p>${existing.score == null ? "尚未评分" : `成绩：${esc(existing.score)} / ${esc(task.totalScore || 100)}`}；${esc(existing.feedback || "暂无评语")}</p></div>` : ""}</div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit" ${task.type === "分组作业" && !group ? "disabled" : ""}>${existing.id ? "重新提交" : "确认提交"}</button></div>`;
}

function gradeSubmissionForm(courseId, submissionId) {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  const submission = course.submissions.find((item) => item.id === submissionId) || {};
  const task = [...course.assignments, ...course.exams].find((item) => item.id === submission.activityId) || {};
  const answerReview = examQuestions(task).map(({ reference, question }, index) => { const answer = submission.answers?.[question.id]; const result = submission.questionResults?.[question.id]; return `<div class="form-section"><h3>${index + 1}. ${esc(question.stem)} <small>${esc(reference.score || question.defaultScore || 0)} 分</small></h3><p class="submission-content">学生答案：${esc(Array.isArray(answer) ? answer.join("、") : answer || "未作答")}</p><p>客观判分：${result?.objective ? (result.correct ? "正确" : "错误") : "需要教师批阅"}${question.explanation ? `；解析：${esc(question.explanation)}` : ""}</p></div>`; }).join("");
  const history = (submission.gradeHistory || []).map((entry) => `<li><b>${esc(entry.score ?? "--")} 分</b><span>${esc(entry.changedBy || "教师")} · ${esc(formatTime(entry.changedAt))} · ${esc(entry.feedback || "无评语")}</span></li>`).join("");
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="submissionId" value="${esc(submissionId)}" /><div class="form-grid"><div class="form-section first"><h3>${esc(task.title || "学生提交")}</h3><p>${esc(submission.studentName || "当前学生")} · 提交于 ${esc(formatTime(submission.submittedAt))}${submission.late ? " · 迟交" : ""}${submission.similarity ? ` · 最高相似度 ${esc(submission.similarity)}%` : ""}</p></div>${answerReview}<div class="form-section"><h3>提交内容</h3><p class="submission-content">${esc(submission.content || "未填写文字内容")}</p>${submission.attachmentUrl ? `<a href="${esc(submission.attachmentUrl)}" target="_blank" rel="noopener">查看附件或作品</a>` : ""}</div>${history ? `<div class="form-section"><h3>成绩调整记录</h3><ul class="module-list">${history}</ul></div>` : ""}<div class="form-row"><label>成绩 *</label><input type="number" name="score" required min="0" max="${esc(task.totalScore || 100)}" value="${esc(submission.score ?? "")}" /></div><div class="form-row"><label>任务满分</label><input value="${esc(task.totalScore || 100)}" disabled /></div><div class="form-row full"><label>教师反馈</label><textarea name="feedback" maxlength="3000" placeholder="指出完成情况和改进建议">${esc(submission.feedback)}</textarea></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存批阅结果</button></div>`;
}

function stageForm(courseId, stage = {}, presetLectureId = "") {
  const course = ensureCourseCollections(store.courses.find((item) => item.id === courseId) || {});
  const selectedResources = new Set(stage.resourceIds || []);
  const selectedKnowledge = new Set(stage.knowledgePointIds || []);
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><input type="hidden" name="stageId" value="${esc(stage.id)}" /><div class="form-grid"><div class="form-row full"><label>阶段名称 *</label><input name="name" required maxlength="80" value="${esc(stage.name)}" placeholder="例如：课前预习" /></div><div class="form-row"><label>所属讲次</label><select name="lectureId"><option value="">暂不归入讲次</option>${course.lectures.map((lecture) => `<option value="${esc(lecture.id)}" ${selected(stage.lectureId || presetLectureId, lecture.id)}>${esc(lecture.name)}</option>`).join("")}</select></div><div class="form-row"><label>阶段类型</label><select name="type">${["课前", "课中", "课后", "新建小节", "实践项目", "视频项目", "教学课件"].map((item) => `<option ${selected(stage.type || "课中", item)}>${item}</option>`).join("")}</select></div><div class="form-row"><label>关联实验模板</label><select name="labId"><option value="">不关联实验</option>${store.labs.map((lab) => `<option value="${esc(lab.id)}" ${selected(stage.labId, lab.id)}>${esc(lab.name)}（${esc(lab.state)}）</option>`).join("")}</select></div><div class="form-row"><label>上级阶段</label><select name="parentId"><option value="">顶级阶段</option>${course.stages.filter((item) => item.id !== stage.id).map((item) => `<option value="${esc(item.id)}" ${selected(stage.parentId, item.id)}>${esc(item.name)}</option>`).join("")}</select></div><div class="form-row"><label>解锁规则</label><select name="unlockRule"><option ${selected(stage.unlockRule || "顺序解锁", "顺序解锁")}>顺序解锁</option><option ${selected(stage.unlockRule, "自由学习")}>自由学习</option><option ${selected(stage.unlockRule, "教师手动解锁")}>教师手动解锁</option></select></div><div class="form-row"><label>预计学习时长（分钟）</label><input type="number" name="estimatedMinutes" min="0" max="10000" value="${esc(stage.estimatedMinutes || 0)}" /></div><div class="form-row"><label>可见性</label><select name="visibility"><option ${selected(stage.visibility || "学生可见", "学生可见")}>学生可见</option><option ${selected(stage.visibility, "暂不开放")}>暂不开放</option></select></div><div class="form-row full"><label>学习目标</label><textarea name="objectives" maxlength="1000" placeholder="说明学生完成该阶段后应掌握的知识和能力">${esc(stage.objectives)}</textarea></div><div class="form-row full"><label>阶段描述</label><textarea name="description" maxlength="1000" placeholder="用于课程安排列表中的简短摘要">${esc(stage.description)}</textarea></div><div class="form-section stage-content-editor"><h3>具体学习内容</h3><p>填写本阶段的讲解正文、学习步骤、示例代码和注意事项；学生可在课程安排中展开阅读。</p><div class="form-row full"><textarea name="content" maxlength="20000" rows="12" placeholder="例如：&#10;一、学习任务&#10;1. 认识 Linux 工作目录&#10;2. 使用 pwd 和 ls 查看目录&#10;&#10;二、操作示例&#10;pwd&#10;ls -la">${esc(stage.content)}</textarea><small>最多 20000 字；换行和段落格式会在学生端保留。课件、图片和视频请在资源库添加后于下方关联。</small></div></div><div class="form-section"><h3>阶段教学资源</h3><p>可同时选择多个已创建资源。</p><div class="check-grid resource-check-grid">${course.resources.length ? course.resources.map((resource) => `<label class="check-option"><input type="checkbox" name="resourceIds" value="${esc(resource.id)}" ${checked(selectedResources.has(resource.id))} /><span>${esc(resource.name)}<small>${esc(resource.type)} · ${esc(resource.status || "草稿")}</small></span></label>`).join("") : `<span class="subtext">资源库为空，可先保存阶段后创建资源。</span>`}</div></div><div class="form-section"><h3>关联知识点</h3><div class="check-grid resource-check-grid">${course.knowledgePoints.length ? course.knowledgePoints.map((point) => `<label class="check-option"><input type="checkbox" name="knowledgePointIds" value="${esc(point.id)}" ${checked(selectedKnowledge.has(point.id))} /><span>${esc(point.name)}<small>${esc(point.code || "知识点")}</small></span></label>`).join("") : `<span class="subtext">暂无知识点。</span>`}</div></div></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存阶段</button></div>`;
}

function classroomForm(courseId) {
  return `<input type="hidden" name="courseId" value="${esc(courseId)}" /><div class="form-grid"><div class="form-section first"><h3>发送至教学课堂</h3><p>配置成员加入、退出与角色申请规则。</p></div><div class="form-row full"><label>课堂名称 *</label><input name="name" required maxlength="80" placeholder="例如：数据结构 2026 春季班" /></div><div class="form-row"><label>邀请码</label><input name="inviteCode" maxlength="32" placeholder="便于学生加入" /></div><div class="form-row"><label>课堂结束日期</label><input type="date" name="endDate" /></div><div class="form-row"><label>课堂可见性</label><select name="visibility"><option>私有课堂</option><option>公开课堂</option></select></div><div class="form-row"><label>成员加入方式</label><select name="access"><option>邀请码或邀请链接</option><option>教师导入</option><option>平台批量注册</option></select></div><label class="check-option compact"><input type="checkbox" name="allowExit" checked /><span>允许学生退出</span></label><label class="check-option compact"><input type="checkbox" name="showContacts" /><span>显示成员联系方式</span></label><label class="check-option compact"><input type="checkbox" name="allowRoleApplication" /><span>允许申请教师/助教</span></label><label class="check-option compact"><input type="checkbox" name="closed" /><span>创建后立即关闭课堂</span></label></div><div class="form-actions"><button class="secondary" type="button" data-action="close-modal">取消</button><button class="primary" type="submit">保存课堂关联</button></div>`;
}

function openModal(type, id, itemId = "", context = "") {
  const form = $("#modalForm");
  const titles = { course: id ? "编辑课程" : "创建课程", lab: id ? "编辑实验模板" : "新建实验模板", question: id ? "编辑题目" : "新建题目", stage: itemId ? "编辑课程阶段" : "新建课程阶段", classroom: "发送至教学课堂", lecture: itemId ? "编辑教学讲次" : "添加教学讲次", member: itemId ? "编辑课堂成员" : "添加课堂成员", section: itemId ? "编辑教学班" : "新建教学班", roleApplication: "申请教师/助教", resource: itemId ? "编辑教学资源" : "新建教学资源", activity: itemId ? "编辑教学内容" : "新建教学内容", assignmentGroup: itemId ? "编辑作业小组" : "新建作业小组", message: "发送站内消息", survey: itemId ? "编辑问卷" : "新建问卷", surveyResponse: "填写问卷", discussionReply: "参与课堂讨论", attendance: itemId ? "编辑签到" : "新建签到", attendanceCheckIn: "课堂签到", peerReview: "作业互评", gradeAppeal: "成绩申诉", resolveAppeal: "处理成绩申诉", knowledge: itemId ? "编辑知识点" : "新建知识点", moduleItem: itemId ? "编辑扩展模块内容" : "新建扩展模块内容", submission: "提交学习任务", grade: "批阅学生提交" };
  $("#modalTitle").textContent = titles[type];
  form.dataset.type = type;
  form.dataset.id = id || "";
  form.dataset.itemId = itemId || "";
  form.dataset.context = context || "";
  if (type === "course") form.innerHTML = courseForm(store.courses.find((item) => item.id === id) || {});
  if (type === "lab") form.innerHTML = labForm(store.labs.find((item) => item.id === id) || {});
  if (type === "question") form.innerHTML = questionForm(store.questionBank.find((item) => item.id === id) || {});
  if (type === "stage") {
    const course = store.courses.find((item) => item.id === id);
    form.innerHTML = stageForm(id, course?.stages?.find((stage) => stage.id === itemId) || {}, context);
  }
  if (type === "classroom") form.innerHTML = classroomForm(id);
  if (type === "lecture") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === id) || {});
    form.innerHTML = lectureForm(id, course.lectures.find((item) => item.id === itemId) || {});
  }
  if (type === "member") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === id) || {});
    form.innerHTML = memberForm(id, course.members.find((item) => item.id === itemId) || {});
  }
  if (type === "section") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === id) || {});
    form.innerHTML = sectionForm(id, course.sections.find((item) => item.id === itemId) || {});
  }
  if (type === "roleApplication") form.innerHTML = roleApplicationForm(id);
  if (type === "resource") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === id) || {});
    form.innerHTML = resourceForm(id, course.resources.find((item) => item.id === itemId) || {});
  }
  if (type === "activity") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === id) || {});
    const collection = { notice: "notices", assignment: "assignments", exam: "exams", discussion: "discussions" }[context];
    form.innerHTML = activityForm(id, context, course[collection]?.find((item) => item.id === itemId) || {});
  }
  if (type === "assignmentGroup") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === id) || {});
    form.innerHTML = assignmentGroupForm(id, course.assignmentGroups.find((item) => item.id === itemId) || {});
  }
  if (type === "message") form.innerHTML = messageForm(id);
  if (type === "survey") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === id) || {});
    form.innerHTML = surveyForm(id, course.surveys.find((item) => item.id === itemId) || {});
  }
  if (type === "surveyResponse") form.innerHTML = surveyResponseForm(id, itemId);
  if (type === "discussionReply") form.innerHTML = discussionReplyForm(id, itemId);
  if (type === "attendance") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === id) || {});
    form.innerHTML = attendanceForm(id, course.attendanceSessions.find((item) => item.id === itemId) || {});
  }
  if (type === "attendanceCheckIn") form.innerHTML = attendanceCheckInForm(id, itemId);
  if (type === "peerReview") form.innerHTML = peerReviewForm(id, itemId);
  if (type === "gradeAppeal") form.innerHTML = gradeAppealForm(id, itemId);
  if (type === "resolveAppeal") form.innerHTML = resolveAppealForm(id, itemId);
  if (type === "knowledge") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === id) || {});
    form.innerHTML = knowledgeForm(id, course.knowledgePoints.find((item) => item.id === itemId) || {});
  }
  if (type === "moduleItem") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === id) || {});
    form.innerHTML = moduleItemForm(id, course.moduleItems.find((item) => item.id === itemId) || {}, context);
  }
  if (type === "submission") form.innerHTML = submissionForm(id, itemId, context);
  if (type === "grade") form.innerHTML = gradeSubmissionForm(id, itemId);
  $("#modalBackdrop").hidden = false;
  if (type === "course") updateModulePicker();
  form.querySelector("input:not([type=hidden])")?.focus();
}

function courseFromForm(form, existing = {}) {
  const data = new FormData(form);
  return {
    ...existing,
    id: existing.id || uid("course"),
    name: data.get("name").trim(),
    code: data.get("code").trim(),
    category: data.get("category"),
    institution: data.get("institution").trim(),
    term: data.get("term").trim(),
    startDate: data.get("startDate"),
    endDate: data.get("endDate"),
    totalHours: data.get("totalHours"),
    credits: data.get("credits"),
    difficulty: data.get("difficulty"),
    language: data.get("language"),
    learningObjectives: data.get("learningObjectives").trim(),
    summary: data.get("summary").trim(),
    targetAudience: data.get("targetAudience").trim(),
    prerequisites: data.get("prerequisites").trim(),
    tags: splitList(data.get("tags")),
    teachingTeam: splitList(data.get("teachingTeam")),
    coverUrl: data.get("coverUrl").trim(),
    modules: data.getAll("modules"),
    visibility: data.get("visibility"),
    access: data.get("access"),
    allowExit: data.has("allowExit"),
    showContacts: data.has("showContacts"),
    allowRoleApplication: data.has("allowRoleApplication"),
    digitalTextbookEnabled: data.has("digitalTextbookEnabled"),
    digitalTextbookUrl: data.get("digitalTextbookUrl").trim(),
    status: existing.status || "草稿",
    stages: existing.stages || [],
    lectures: existing.lectures || [],
    resources: existing.resources || [],
    members: existing.members || [],
    notices: existing.notices || [],
    messages: existing.messages || [],
    assignments: existing.assignments || [],
    assignmentGroups: existing.assignmentGroups || [],
    exams: existing.exams || [],
    discussions: existing.discussions || [],
    discussionReplies: existing.discussionReplies || [],
    knowledgePoints: existing.knowledgePoints || [],
    moduleItems: existing.moduleItems || [],
    submissions: existing.submissions || [],
    classrooms: existing.classrooms || [],
    sections: existing.sections || [],
    roleApplications: existing.roleApplications || [],
    surveys: existing.surveys || [],
    surveyResponses: existing.surveyResponses || [],
    attendanceSessions: existing.attendanceSessions || [],
    attendanceRecords: existing.attendanceRecords || [],
    peerReviews: existing.peerReviews || [],
    gradeAppeals: existing.gradeAppeals || [],
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

document.addEventListener("click", async (event) => {
  const role = event.target.closest("[data-role]")?.dataset.role;
  const page = event.target.closest("[data-page]")?.dataset.page;
  const actionNode = event.target.closest("[data-action]");
  const action = actionNode?.dataset.action;
  if (role) {
    if (!authState.authRequired) {
      store.role = role;
      store.page = "home";
      render();
    } else if (role !== store.role) toast("工作台由当前登录账号身份决定");
    return;
  }
  if (page) {
    store.page = page;
    render();
    return;
  }
  if (!action) return;
  const id = actionNode.dataset.id;
  if (action === "open-lab") {
    const labId = actionNode.dataset.labId || "";
    const linkedCourse = labId ? store.courses.find((course) => (course.stages || []).some((stage) => stage.labId === labId)) : null;
    openLab(labId, { courseId: actionNode.dataset.courseId || linkedCourse?.id || "", checkpointId: actionNode.dataset.checkpointId || "" });
    return;
  }
  if (action === "open-exam-lab") {
    const query = new URLSearchParams({ labId: actionNode.dataset.labId || "", checkpointId: actionNode.dataset.checkpointId || "", commitSha: actionNode.dataset.commitSha || "", courseId: actionNode.dataset.courseId || "", examId: actionNode.dataset.activityId || "", returnPage: "student-course" });
    query.set("ui", "20261108-3");
    location.href = `index.html?${query}`;
    return;
  }
  if (action === "refresh-admin-runtime") {
    adminRuntime.loading = true;
    render();
    loadAdminRuntime();
    return;
  }
  if (action === "review-lab-public") {
    const lab = store.labs.find((item) => item.id === id);
    if (!lab || lab.publicScope !== "申请公开") return toast("实验公开申请不存在");
    const decision = actionNode.dataset.decision;
    lab.publicReviewStatus = decision === "通过" ? "已通过" : decision === "驳回" ? "已驳回" : "待审核";
    lab.publicReviewedAt = new Date().toISOString();
    saveStore(); render(); return toast(decision === "通过" ? "实验已通过公开审核" : decision === "驳回" ? "公开申请已驳回" : "实验公开状态已撤回");
  }
  if (action === "open-linked-lab") {
    const lab = store.labs.find((item) => item.id === actionNode.dataset.labId);
    if (lab?.builtIn) openLab(lab.id, { courseId: actionNode.dataset.courseId || store.selectedCourseId || "" });
    else toast("该实验尚未配置可运行环境，请联系教师");
    return;
  }
  if (action === "open-resource") {
    const courseId = actionNode.dataset.courseId;
    const resourceId = actionNode.dataset.resourceId;
    const course = store.courses.find((item) => item.id === courseId);
    const resource = findCourseLearningItem(course, resourceId);
    if (!resource) return toast("课程资源不存在");
    openResourceViewer(courseId, resourceId);
    updateResourceProgress(courseId, resourceId, resource.completionRule === "访问即完成" ? "已完成" : "学习中").then((saved) => {
      if (!saved) return;
      const viewer = $("#modalForm");
      if (!$("#modalBackdrop").hidden && viewer.dataset.type === "resourceViewer" && viewer.dataset.itemId === resourceId) viewer.innerHTML = resourceLearningViewer(course, resource);
      toast("已打开学习内容并记录学习进度");
    });
    return;
  }
  if (action === "complete-resource" || action === "complete-resource-viewer") {
    const courseId = actionNode.dataset.courseId;
    const resourceId = actionNode.dataset.resourceId;
    updateResourceProgress(courseId, resourceId, "已完成").then((saved) => {
      if (!saved) return;
      if (action === "complete-resource-viewer") {
        actionNode.textContent = "已完成学习";
        actionNode.disabled = true;
        const status = actionNode.closest(".resource-learning-viewer")?.querySelector(".resource-viewer-summary > strong");
        if (status) { status.textContent = "已完成"; status.className = "completed"; }
      }
      toast("资源已标记完成");
    });
    return;
  }
  if (action === "submit-activity") return openModal("submission", actionNode.dataset.courseId, actionNode.dataset.resourceId, actionNode.dataset.kind);
  if (action === "grade-submission") return openModal("grade", actionNode.dataset.courseId, actionNode.dataset.submissionId);
  if (action === "return-submission") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === actionNode.dataset.courseId) || {});
    const submission = course.submissions.find((item) => item.id === actionNode.dataset.submissionId);
    if (!submission) return;
    const feedback = prompt("请输入退回重做原因", submission.feedback || "请根据教师意见修改后重新提交");
    if (feedback == null) return;
    if (!apiBase) { Object.assign(submission, { status: "需重做", feedback, returnedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); saveStore(); render(); return toast("作业已退回重做"); }
    fetch(`${apiBase}/submissions/return`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: course.id, submissionId: submission.id, feedback }) }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.message || "退回失败"); Object.assign(submission, body.submission); render(); toast("作业已退回重做"); }).catch((error) => toast(error.message || "退回失败"));
    return;
  }
  if (action === "export-grades") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === id) || {});
    const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const header = ["学生", "学号/账号", "任务", "类型", "状态", "成绩", "满分", "提交次数", "是否迟交", "最高相似度", "提交时间", "教师反馈"];
    const lines = [header, ...course.submissions.map((submission) => { const task = [...course.assignments, ...course.exams].find((item) => item.id === submission.activityId) || {}; return [submission.studentName, submission.studentId, task.title, submission.kind === "exam" ? "考试" : "作业", submission.status, submission.score ?? "", task.totalScore || 100, submission.attemptCount || 1, submission.late ? "是" : "否", submission.similarity || 0, submission.submittedAt, submission.feedback || ""]; })].map((row) => row.map(quote).join(","));
    const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${course.code || course.name}-成绩.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); return toast("成绩文件已导出");
  }
  if (action === "export-learning-analytics") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === id) || {});
    const tasks = [...course.assignments, ...course.exams].filter((item) => item.status === "已发布");
    const sessions = course.attendanceSessions.filter((item) => item.status !== "草稿");
    const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = course.members.filter((member) => member.role === "学生").map((member) => {
      const identities = new Set([member.accountId, member.id, member.identifier].filter(Boolean));
      const submissions = course.submissions.filter((item) => identities.has(item.studentId) || item.studentName === member.name);
      const scores = submissions.map((item) => Number(item.score)).filter(Number.isFinite);
      const attendance = course.attendanceRecords.filter((item) => identities.has(item.studentId) || item.studentName === member.name).length;
      const reviews = course.peerReviews.filter((item) => identities.has(item.reviewerId)).length;
      return [member.name, member.identifier || member.accountId || member.id, course.sections.find((item) => item.id === member.classId)?.name || "未分班", new Set(submissions.map((item) => item.activityId)).size, tasks.length, scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 10) / 10 : "", attendance, sessions.length, reviews];
    });
    const lines = [["学生", "学号/账号", "班级", "已提交任务", "已发布任务", "平均分", "已签到", "签到次数", "互评次数"], ...rows].map((row) => row.map(quote).join(","));
    const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${course.code || course.name}-学情统计.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000); return toast("学情统计已导出");
  }
  if (action === "apply-course-role") return openModal("roleApplication", id);
  if (action === "simulate-lab") {
    const lab = store.labs.find((item) => item.id === id);
    if (!lab?.builtIn) return toast("请先为实验配置运行环境");
    openLab(lab.id, { teacherPreview: true });
    return;
  }
  if (action === "view-repository-diff") {
    const output = $("#repositoryDiff");
    if (!output) return;
    output.hidden = false;
    output.textContent = "正在读取 Git 差异…";
    fetch(`${apiBase}/repositories/${encodeURIComponent(id)}/diff?from=${encodeURIComponent(actionNode.dataset.commit || "")}`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Git 差异读取失败");
      output.textContent = body.diff || "该版本与当前版本没有文件差异。";
    }).catch((error) => { output.textContent = error.message || "Git 差异读取失败"; });
    return;
  }
  if (action === "rollback-repository") {
    const commitSha = actionNode.dataset.commit || "";
    if (!confirm(`确定将代码仓库恢复到 ${commitSha.slice(0, 8)} 吗？系统会创建一个新的回滚提交，历史不会被删除。`)) return;
    actionNode.disabled = true;
    fetch(`${apiBase}/repositories/${encodeURIComponent(id)}/rollback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commitSha }) }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Git 版本回滚失败");
      const index = store.labs.findIndex((lab) => lab.id === id);
      if (index >= 0) store.labs[index] = body.lab;
      $("#modalForm").innerHTML = labForm(body.lab);
      toast(`代码仓库已回滚，新版本 ${body.headCommit.slice(0, 8)}`);
    }).catch((error) => { actionNode.disabled = false; toast(error.message || "Git 版本回滚失败"); });
    return;
  }
  if (action === "add-checkpoint-test" || action === "add-test-case") {
    const checkpoint = actionNode.closest(".checkpoint-card");
    const paths = [...formRepositoryPaths()];
    checkpoint?.querySelector(".evaluation-tests")?.insertAdjacentHTML("beforeend", testEditorRow({ id: uid("test"), visibility: "public", ruleType: "file-exists", target: paths[0] || ".", expected: "文件存在", weight: 0, required: true }, paths));
    return;
  }
  if (action === "add-checkpoint-answer" || action === "add-reference-answer") {
    actionNode.closest(".checkpoint-card")?.querySelector(".reference-answers")?.insertAdjacentHTML("beforeend", answerEditorRow({ id: uid("answer"), name: "新提示", content: "", deductionPercent: 0 }));
    return;
  }
  if (action === "add-survey-question") {
    const list = $("#surveyQuestionList");
    list?.insertAdjacentHTML("beforeend", surveyQuestionRow({ type: "单选题", title: "", options: [], required: true }, list.children.length));
    return;
  }
  if (action === "add-question-option") {
    const list = $("#questionOptionList");
    if (!list) return;
    if (list.children.length >= 26) return toast("选择题最多支持 26 个选项");
    const type = document.querySelector('[name="questionType"]')?.value || "单选题";
    list.insertAdjacentHTML("beforeend", questionOptionRow({}, list.children.length, type));
    reindexQuestionOptions();
    list.lastElementChild?.querySelector('[name="questionOptionText"]')?.focus();
    return;
  }
  if (action === "remove-question-option") {
    const list = $("#questionOptionList");
    if (!list) return;
    if (list.children.length <= 2) return toast("选择题至少保留两个选项");
    actionNode.closest(".question-option-row")?.remove();
    reindexQuestionOptions();
    return;
  }
  if (action === "remove-survey-question") {
    const list = actionNode.closest(".config-list");
    if ((list?.children.length || 0) <= 1) return toast("问卷至少保留一道题目");
    actionNode.closest(".survey-question-row")?.remove(); return;
  }
  if (action === "apply-lab-preset") {
    const modalForm = $("#modalForm");
    if (!modalForm || modalForm.dataset.type !== "lab") return;
    modalForm.innerHTML = labForm(labPreset(actionNode.dataset.preset || "linux"));
    refreshRepositorySelectors();
    toast("常用模板已填入，请按步骤检查后保存");
    return;
  }
  if (action === "jump-lab-section") {
    document.getElementById(actionNode.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (action === "add-starter-file") {
    $("#starterFiles")?.insertAdjacentHTML("beforeend", starterFileEditorRow({ path: "new-file.txt", content: "", readOnly: false }));
    refreshRepositorySelectors();
    return;
  }
  if (action === "add-checkpoint") {
    const paths = [...formRepositoryPaths()];
    const list = $("#checkpointList");
    list?.insertAdjacentHTML("beforeend", checkpointEditor({ id: uid("checkpoint"), name: `第 ${(list?.children.length || 0) + 1} 关`, objectives: "", description: "", requirements: "", evaluationConfig: defaultEvaluationConfig() }, list?.children.length || 0, paths));
    return;
  }
  if (action === "remove-checkpoint") {
    const list = actionNode.closest(".checkpoint-list");
    if ((list?.children.length || 0) <= 1) return toast("实践项目至少保留一个关卡");
    actionNode.closest(".checkpoint-card")?.remove();
    return;
  }
  if (action === "remove-config-row") {
    const list = actionNode.closest(".config-list");
    if (list?.children.length <= 1) return toast("至少保留一项配置");
    const repositoryRow = Boolean(actionNode.closest(".starter-file-row"));
    actionNode.closest(".config-row")?.remove();
    if (repositoryRow) refreshRepositorySelectors();
    return;
  }
  if (action === "module-filter") {
    const picker = $("#modulePicker");
    const category = actionNode.dataset.category;
    picker?.querySelectorAll("[data-module-category]").forEach((item) => { item.hidden = category !== "全部" && item.dataset.moduleCategory !== category; });
    picker?.querySelectorAll('[data-action="module-filter"]').forEach((item) => item.classList.toggle("active", item === actionNode));
    return;
  }
  if (action === "select-all-modules" || action === "clear-modules") {
    $("#modulePicker")?.querySelectorAll('input[name="modules"]').forEach((input) => { input.checked = action === "select-all-modules"; });
    updateModulePicker();
    return;
  }
  if (action === "remove-module-tag") {
    const input = $(`#modulePicker input[name="modules"][value="${CSS.escape(actionNode.dataset.moduleId)}"]`);
    if (input) input.checked = false;
    updateModulePicker();
    return;
  }
  if (action === "close-modal") return closeModal();
  if (action === "new-course") return openModal("course");
  if (action === "edit-course") return openModal("course", id);
  if (action === "new-question") return openModal("question");
  if (action === "edit-question") return openModal("question", id);
  if (action === "duplicate-question") {
    const source = questionById(id);
    if (!source) return;
    store.questionBank.unshift({ ...structuredClone(source), id: uid("question"), stem: `${source.stem}（副本）`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    saveStore(); render(); return toast("题目副本已创建");
  }
  if (action === "delete-question") {
    const question = questionById(id);
    if (!question) return;
    const used = store.courses.some((course) => (course.exams || []).some((exam) => (exam.questionRefs || []).some((reference) => reference.questionId === id)));
    if (used) return toast("该题目正在被试卷使用，请先从试卷中移除");
    if (!confirm(`确定删除题目“${question.stem.slice(0, 30)}”吗？`)) return;
    store.questionBank = store.questionBank.filter((item) => item.id !== id);
    saveStore(); render(); return toast("题目已删除");
  }
  if (action === "new-lab") return openModal("lab");
  if (action === "edit-lab") return openModal("lab", id);
  if (action === "new-stage") return openModal("stage", id, "", actionNode.dataset.lectureId || "");
  if (action === "edit-stage") return openModal("stage", actionNode.dataset.courseId, actionNode.dataset.stageId);
  if (action === "new-classroom") return openModal("classroom", id);
  if (action === "course-workspace-tab") {
    store.filters.courseWorkspaceTab = actionNode.dataset.tab || "overview";
    return render();
  }
  if (action === "new-lecture") return openModal("lecture", id);
  if (action === "edit-lecture") return openModal("lecture", actionNode.dataset.courseId, actionNode.dataset.lectureId);
  if (action === "new-member") return openModal("member", id);
  if (action === "edit-member") return openModal("member", actionNode.dataset.courseId, actionNode.dataset.memberId);
  if (action === "new-section") return openModal("section", id);
  if (action === "edit-section") return openModal("section", actionNode.dataset.courseId, actionNode.dataset.sectionId);
  if (action === "delete-section") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === actionNode.dataset.courseId) || {});
    const section = course.sections.find((item) => item.id === actionNode.dataset.sectionId);
    if (!section || !confirm(`确定删除班级“${section.name}”吗？班级成员将变为未分班。`)) return;
    course.sections = course.sections.filter((item) => item.id !== section.id);
    course.members.forEach((member) => { if (member.classId === section.id) member.classId = ""; });
    saveStore(); render(); return toast("班级已删除，原成员已移至未分班");
  }
  if (action === "review-role-application") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === actionNode.dataset.courseId) || {});
    const application = course.roleApplications.find((item) => item.id === actionNode.dataset.applicationId);
    if (!application || application.status !== "待审核") return;
    application.status = actionNode.dataset.decision === "通过" ? "已通过" : "已驳回";
    application.reviewedAt = new Date().toISOString();
    if (application.status === "已通过") { const member = course.members.find((item) => item.id === application.memberId); if (member) member.role = application.requestedRole; }
    saveStore(); render(); return toast(`角色申请已${application.status === "已通过" ? "通过" : "驳回"}`);
  }
  if (action === "new-resource") return openModal("resource", id);
  if (action === "edit-resource") return openModal("resource", actionNode.dataset.courseId, actionNode.dataset.resourceId);
  if (action === "new-activity") return openModal("activity", id, "", actionNode.dataset.kind);
  if (action === "edit-activity") return openModal("activity", actionNode.dataset.courseId, actionNode.dataset.itemId, actionNode.dataset.kind);
  if (action === "new-assignment-group") return openModal("assignmentGroup", id);
  if (action === "new-message") return openModal("message", id);
  if (action === "edit-assignment-group") return openModal("assignmentGroup", actionNode.dataset.courseId, actionNode.dataset.groupId);
  if (action === "delete-assignment-group") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === actionNode.dataset.courseId) || {});
    const group = course.assignmentGroups.find((item) => item.id === actionNode.dataset.groupId);
    if (!group || !confirm(`确定删除小组“${group.name}”吗？已有小组提交不会被删除。`)) return;
    course.assignmentGroups = course.assignmentGroups.filter((item) => item.id !== group.id); saveStore(); render(); return toast("作业小组已删除");
  }
  if (action === "new-survey") return openModal("survey", id);
  if (action === "edit-survey") return openModal("survey", actionNode.dataset.courseId, actionNode.dataset.surveyId);
  if (action === "submit-survey") return openModal("surveyResponse", actionNode.dataset.courseId, actionNode.dataset.surveyId);
  if (action === "reply-discussion") return openModal("discussionReply", actionNode.dataset.courseId, actionNode.dataset.discussionId);
  if (action === "new-attendance") return openModal("attendance", id);
  if (action === "edit-attendance") return openModal("attendance", actionNode.dataset.courseId, actionNode.dataset.sessionId);
  if (action === "check-in-attendance") return openModal("attendanceCheckIn", actionNode.dataset.courseId, actionNode.dataset.sessionId);
  if (action === "peer-review") return openModal("peerReview", actionNode.dataset.courseId, actionNode.dataset.submissionId);
  if (action === "grade-appeal") return openModal("gradeAppeal", actionNode.dataset.courseId, actionNode.dataset.submissionId);
  if (action === "resolve-grade-appeal") return openModal("resolveAppeal", actionNode.dataset.courseId, actionNode.dataset.appealId);
  if (action === "change-attendance-status" || action === "delete-attendance") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === actionNode.dataset.courseId) || {});
    const session = course.attendanceSessions.find((item) => item.id === actionNode.dataset.sessionId);
    if (!session) return;
    if (action === "delete-attendance") {
      if (!confirm(`确定删除签到“${session.title}”及其签到记录吗？`)) return;
      course.attendanceSessions = course.attendanceSessions.filter((item) => item.id !== session.id);
      course.attendanceRecords = course.attendanceRecords.filter((item) => item.sessionId !== session.id);
      saveStore(); render(); return toast("签到已删除");
    }
    session.status = actionNode.dataset.status;
    if (session.status === "进行中") { session.startedAt = new Date().toISOString(); session.endedAt = ""; }
    if (session.status === "已结束") session.endedAt = new Date().toISOString();
    saveStore(); render(); return toast(session.status === "进行中" ? `签到已开始，签到码：${session.code}` : "签到已结束");
  }
  if (action === "delete-survey" || action === "toggle-survey-publish") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === actionNode.dataset.courseId) || {});
    const survey = course.surveys.find((item) => item.id === actionNode.dataset.surveyId);
    if (!survey) return;
    if (action === "delete-survey") { if (!confirm(`确定删除问卷“${survey.title}”及其提交记录吗？`)) return; course.surveys = course.surveys.filter((item) => item.id !== survey.id); course.surveyResponses = course.surveyResponses.filter((item) => item.surveyId !== survey.id); saveStore(); render(); return toast("问卷已删除"); }
    survey.status = survey.status === "已发布" ? "已关闭" : "已发布"; survey.updatedAt = new Date().toISOString(); saveStore(); render(); return toast(`问卷已${survey.status === "已发布" ? "发布" : "关闭"}`);
  }
  if (action === "new-knowledge") return openModal("knowledge", id);
  if (action === "edit-knowledge") return openModal("knowledge", actionNode.dataset.courseId, actionNode.dataset.knowledgeId);
  if (action === "new-module-item") return openModal("moduleItem", id, "", actionNode.dataset.moduleId);
  if (action === "edit-module-item") return openModal("moduleItem", actionNode.dataset.courseId, actionNode.dataset.itemId);
  if (action === "move-lecture-up" || action === "move-lecture-down") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === actionNode.dataset.courseId) || {});
    const index = course.lectures.findIndex((item) => item.id === actionNode.dataset.lectureId);
    const target = action === "move-lecture-up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= course.lectures.length) return;
    [course.lectures[index], course.lectures[target]] = [course.lectures[target], course.lectures[index]];
    saveStore(); render(); return toast("讲次顺序已更新");
  }
  if (action === "delete-lecture") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === actionNode.dataset.courseId) || {});
    const lecture = course.lectures.find((item) => item.id === actionNode.dataset.lectureId);
    if (!lecture || !confirm(`确定删除讲次“${lecture.name}”吗？阶段将保留为未分组。`)) return;
    course.lectures = course.lectures.filter((item) => item.id !== lecture.id);
    course.stages.forEach((stage) => { if (stage.lectureId === lecture.id) stage.lectureId = ""; });
    saveStore(); render(); return toast("讲次已删除，原阶段已移至未分组");
  }
  if (action === "delete-member") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === actionNode.dataset.courseId) || {});
    const member = course.members.find((item) => item.id === actionNode.dataset.memberId);
    if (!member || !confirm(`确定移除成员“${member.name}”吗？`)) return;
    course.members = course.members.filter((item) => item.id !== member.id);
    saveStore(); render(); return toast("课堂成员已移除");
  }
  if (action === "delete-resource" || action === "toggle-resource-publish") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === actionNode.dataset.courseId) || {});
    const resource = course.resources.find((item) => item.id === actionNode.dataset.resourceId);
    if (!resource) return;
    if (action === "delete-resource") {
      if (!confirm(`确定删除资源“${resource.name}”吗？`)) return;
      course.resources = course.resources.filter((item) => item.id !== resource.id);
      course.stages.forEach((stage) => { stage.resourceIds = (stage.resourceIds || []).filter((id) => id !== resource.id); });
      saveStore(); render(); return toast("教学资源已删除");
    }
    resource.status = resource.status === "已发布" ? "草稿" : "已发布";
    resource.updatedAt = new Date().toISOString();
    saveStore(); render(); return toast(`资源已${resource.status === "已发布" ? "发布" : "撤回"}`);
  }
  if (action === "delete-activity" || action === "toggle-activity-publish") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === actionNode.dataset.courseId) || {});
    const key = { notice: "notices", assignment: "assignments", exam: "exams", discussion: "discussions" }[actionNode.dataset.kind];
    const item = course[key]?.find((entry) => entry.id === actionNode.dataset.itemId);
    if (!item) return;
    if (action === "delete-activity") {
      if (!confirm(`确定删除“${item.title}”吗？`)) return;
      course[key] = course[key].filter((entry) => entry.id !== item.id);
      saveStore(); render(); return toast("教学内容已删除");
    }
    if (actionNode.dataset.kind === "assignment" && item.status !== "已发布" && !String(item.description || "").trim()) return toast("请先编辑并填写作业内容，再发布作业");
    item.status = item.status === "已发布" ? "草稿" : "已发布";
    item.updatedAt = new Date().toISOString();
    if (item.status === "已发布") item.publishedAt = item.publishedAt || item.updatedAt;
    saveStore(); render(); return toast(`内容已${item.status === "已发布" ? "发布" : "撤回"}`);
  }
  if (action === "delete-knowledge") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === actionNode.dataset.courseId) || {});
    const point = course.knowledgePoints.find((item) => item.id === actionNode.dataset.knowledgeId);
    if (!point || !confirm(`确定删除知识点“${point.name}”吗？`)) return;
    course.knowledgePoints = course.knowledgePoints.filter((item) => item.id !== point.id);
    course.knowledgePoints.forEach((item) => { if (item.prerequisiteId === point.id) item.prerequisiteId = ""; });
    course.stages.forEach((stage) => { stage.knowledgePointIds = (stage.knowledgePointIds || []).filter((id) => id !== point.id); });
    saveStore(); render(); return toast("知识点已删除");
  }
  if (action === "delete-module-item" || action === "toggle-module-item-publish") {
    const course = ensureCourseCollections(store.courses.find((item) => item.id === actionNode.dataset.courseId) || {});
    const item = course.moduleItems.find((entry) => entry.id === actionNode.dataset.itemId);
    if (!item) return;
    if (action === "delete-module-item") {
      if (!confirm(`确定删除“${item.title}”吗？`)) return;
      course.moduleItems = course.moduleItems.filter((entry) => entry.id !== item.id);
      saveStore(); render(); return toast("扩展模块内容已删除");
    }
    if (item.status !== "已发布" && ["live", "ai-agent", "ai-knowledge"].includes(item.moduleId) && !/^https?:\/\//i.test(item.url || "")) return toast("该模块发布前必须配置可访问的服务地址");
    item.status = item.status === "已发布" ? "草稿" : "已发布";
    item.updatedAt = new Date().toISOString();
    saveStore(); render(); return toast(`模块内容已${item.status === "已发布" ? "发布" : "撤回"}`);
  }
  if (action === "view-student-course") {
    store.selectedCourseId = id;
    store.filters.studentCourseTab = "all";
    store.page = "student-course";
    return render();
  }
  if (action === "back-student-courses") {
    store.page = "learning";
    return render();
  }
  if (action === "student-course-tab") {
    store.filters.studentCourseTab = actionNode.dataset.tab || "all";
    return render();
  }
  if (action === "manage-course") {
    store.selectedCourseId = id;
    store.filters.courseWorkspaceTab = "overview";
    store.page = "course";
    return render();
  }
  if (action === "back-courses" || action === "go-courses") {
    store.page = "courses";
    return render();
  }
  if (action === "toggle-course-publish") {
    const course = store.courses.find((item) => item.id === id);
    if (!course) return;
    if (course.status === "草稿") {
      const readiness = courseReadiness(course);
      if (!readiness.ready) return toast(`发布前请完善：${readiness.errors.join("、")}`);
    }
    course.status = course.status === "已发布" ? "草稿" : "已发布";
    course.updatedAt = new Date().toISOString();
    const result = await saveStore();
    if (!result.saved) return;
    render();
    return toast(course.status === "已发布" ? "课程已发布，可发送至教学课堂" : "课程已撤回为草稿");
  }
  if (action === "request-public") {
    const course = store.courses.find((item) => item.id === id);
    if (!course || !["已发布", "公开申请中"].includes(course.status)) return;
    course.status = course.status === "公开申请中" ? "已发布" : "公开申请中";
    course.updatedAt = new Date().toISOString();
    const result = await saveStore();
    if (!result.saved) return;
    render();
    return toast(course.status === "公开申请中" ? "公开申请已提交，等待管理员审核" : "已撤回公开申请");
  }
  if (action === "archive-course") {
    const course = store.courses.find((item) => item.id === id);
    if (!course) return;
    course.status = course.status === "已归档" ? "草稿" : "已归档";
    course.updatedAt = new Date().toISOString();
    saveStore();
    render();
    return toast(course.status === "已归档" ? "课程已归档" : "课程已恢复为草稿");
  }
  if (action === "duplicate-course") {
    const source = store.courses.find((item) => item.id === id);
    if (!source) return;
    const copy = structuredClone(source);
    copy.id = uid("course");
    copy.name = `${source.name}（副本）`;
    copy.code = `${source.code}-COPY-${String(Date.now()).slice(-4)}`;
    copy.status = "草稿";
    copy.createdAt = new Date().toISOString();
    store.courses.unshift(copy);
    store.selectedCourseId = copy.id;
    saveStore();
    render();
    return toast("课程副本已创建");
  }
  if (action === "delete-course") {
    const course = store.courses.find((item) => item.id === id);
    if (!course || !confirm(`确定删除课程“${course.name}”吗？此操作无法撤销。`)) return;
    store.courses = store.courses.filter((item) => item.id !== id);
    store.selectedCourseId = null;
    store.page = "courses";
    saveStore();
    render();
    return toast("课程已删除");
  }
  if (action === "delete-stage") {
    const course = store.courses.find((item) => item.id === actionNode.dataset.courseId);
    if (!course || !confirm("确定删除这个课程阶段吗？")) return;
    course.stages = (course.stages || []).filter((stage) => stage.id !== actionNode.dataset.stageId);
    saveStore();
    render();
    return toast("课程阶段已删除");
  }
  if (action === "move-stage-up" || action === "move-stage-down") {
    const course = store.courses.find((item) => item.id === actionNode.dataset.courseId);
    if (!course) return;
    const stages = course.stages || [];
    const index = stages.findIndex((stage) => stage.id === actionNode.dataset.stageId);
    const target = action === "move-stage-up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= stages.length) return;
    [stages[index], stages[target]] = [stages[target], stages[index]];
    saveStore();
    render();
    return toast("课程阶段顺序已更新");
  }
  if (action === "toggle-lab-publish") {
    const lab = store.labs.find((item) => item.id === id);
    if (!lab) return;
    if (lab.state !== "已发布") {
      const readiness = labReadiness(lab);
      if (!readiness.ready) return toast(`发布前请完善：${readiness.errors.join("、")}`);
    }
    lab.state = lab.state === "已发布" ? "草稿" : "已发布";
    if (lab.state === "已发布" && lab.publicScope === "申请公开" && lab.publicReviewStatus !== "已通过") lab.publicReviewStatus = "待审核";
    saveStore();
    render();
    return toast(lab.state === "已发布" ? "实验模板已发布" : "实验模板已撤回");
  }
  if (action === "delete-lab") {
    const lab = store.labs.find((item) => item.id === id);
    if (!lab || !confirm(`确定删除实验模板“${lab.name}”吗？`)) return;
    store.labs = store.labs.filter((item) => item.id !== id);
    saveStore();
    render();
    return toast("实验模板已删除");
  }
});

document.addEventListener("input", (event) => {
  if (event.target.matches('.starter-file-row [name="starterPath"]')) {
    refreshRepositorySelectors();
    return;
  }
  if (event.target.id === "studentCourseSearch") {
    store.filters.courseResourceQuery = event.target.value;
    const cursor = event.target.selectionStart;
    render();
    const input = $("#studentCourseSearch");
    input?.focus();
    input?.setSelectionRange(cursor, cursor);
    return;
  }
  if (event.target.id === "courseSearch") {
    store.filters.courseQuery = event.target.value;
    const cursor = event.target.selectionStart;
    render();
    const input = $("#courseSearch");
    input?.focus();
    input?.setSelectionRange(cursor, cursor);
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches('#modulePicker input[name="modules"]')) updateModulePicker();
  if (event.target.matches('#modalForm [name="questionType"]')) refreshQuestionAnswerEditor(event.target.value);
  if (event.target.matches('#modalForm [name="testRule"]')) refreshTestExpectedField(event.target);
  if (event.target.id === "courseStatusFilter") {
    store.filters.courseStatus = event.target.value;
    render();
  }
});

$("#modalBackdrop").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

$("#modalForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const type = form.dataset.type;
  const id = form.dataset.id;
  if (type === "course") {
    const existing = store.courses.find((item) => item.id === id) || {};
    const course = courseFromForm(form, existing);
    const duplicate = store.courses.some((item) => item.id !== course.id && item.code.toLowerCase() === course.code.toLowerCase());
    if (duplicate) return toast("课程编号已存在，请更换后重试");
    if (existing.id) store.courses[store.courses.findIndex((item) => item.id === existing.id)] = course;
    else {
      if (store.settings.teacherName) course.members.push({ id: uid("member"), name: store.settings.teacherName, role: "教师", status: "正常", identifier: "", email: "", joinedAt: new Date().toISOString() });
      store.courses.unshift(course);
      store.filters.courseWorkspaceTab = "plan";
    }
    store.selectedCourseId = course.id;
    store.page = "course";
    const result = await saveStore();
    if (!result.saved) return;
    closeModal();
    render();
    return toast(existing.id ? "课程信息已更新" : "课程已创建，可继续编排阶段");
  }
  if (type === "question") {
    const data = new FormData(form);
    const existing = store.questionBank.find((item) => item.id === id);
    const questionType = data.get("questionType");
    const optionRows = [...form.querySelectorAll("#questionOptionList .question-option-row")];
    const options = questionType === "判断题"
      ? [{ key: "A", text: "正确" }, { key: "B", text: "错误" }]
      : optionRows.map((row, index) => ({ key: String.fromCharCode(65 + index), text: row.querySelector('[name="questionOptionText"]')?.value.trim() || "" })).filter((option) => option.text);
    const answers = ["单选题", "多选题", "判断题"].includes(questionType)
      ? data.getAll("questionCorrectOption").map((answer) => String(answer).toUpperCase())
      : splitList(data.get("answers"));
    if (["单选题", "多选题"].includes(questionType) && options.length < 2) return toast("选择题至少需要两个选项");
    if (["单选题", "多选题", "判断题"].includes(questionType) && !answers.length) return toast("请设置正确答案");
    if (questionType === "单选题" && answers.length !== 1) return toast("单选题只能设置一个正确答案");
    if (["单选题", "多选题"].includes(questionType) && answers.some((answer) => !options.some((option) => option.key === answer))) return toast("正确答案必须对应已有选项");
    const question = { ...(existing || {}), id: existing?.id || uid("question"), type: questionType, stem: data.get("stem").trim(), options, answers, explanation: data.get("explanation").trim(), difficulty: data.get("difficulty"), defaultScore: Number(data.get("defaultScore") || 5), courseId: existing?.courseId || "", scope: existing?.scope || "仅本人", tags: existing?.tags || [], createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (existing) store.questionBank[store.questionBank.findIndex((item) => item.id === id)] = question;
    else store.questionBank.unshift(question);
    saveStore(); closeModal(); render(); return toast(existing ? "题目已更新" : "题目已保存到题库");
  }
  if (type === "lab") {
    if (!(await ensureActiveSession())) return;
    const data = new FormData(form);
    const existing = store.labs.find((item) => item.id === id);
    const initialFiles = [...form.querySelectorAll(".starter-file-row")].map((row) => ({
      path: row.querySelector('[name="starterPath"]').value.trim().replace(/\\/g, "/"),
      content: row.querySelector('[name="starterContent"]').value,
      readOnly: row.querySelector('[name="starterReadOnly"]').checked,
    }));
    if (initialFiles.some((file) => !/^[A-Za-z0-9._/-]{1,160}$/.test(file.path) || file.path.startsWith("/") || file.path.split("/").includes(".."))) return toast("初始文件只能使用安全的相对路径");
    if (new Set(initialFiles.map((file) => file.path)).size !== initialFiles.length) return toast("初始文件路径不能重复");
    const checkpoints = [...form.querySelectorAll(".checkpoint-card")].map((card, index) => {
      const tests = [...card.querySelectorAll(".evaluation-test-row")].map((row) => ({
        id: row.dataset.testId || uid("test"),
        name: row.querySelector('[name="testName"]').value.trim(),
        visibility: row.querySelector('[name="testVisibility"]').value,
        ruleType: row.querySelector('[name="testRule"]').value,
        target: row.querySelector('[name="testTarget"]').value.trim() || ".",
        expected: row.querySelector('[name="testExpected"]').value,
        weight: Number(row.querySelector('[name="testWeight"]').value || 0),
        required: row.querySelector('[name="testRequired"]').checked,
      }));
      const referenceAnswers = [...card.querySelectorAll(".reference-answer-row")].map((row) => ({
        id: row.dataset.answerId || uid("answer"),
        name: row.querySelector('[name="answerName"]').value.trim(),
        content: row.querySelector('[name="answerContent"]').value.trim(),
        deductionPercent: Number(row.querySelector('[name="answerDeduction"]').value || 0),
      }));
      return {
        id: card.dataset.checkpointId || uid("checkpoint"),
        order: index + 1,
        name: card.querySelector('[name="checkpointName"]').value.trim(),
        difficulty: card.querySelector('[name="difficulty"]').value,
        rewardExperience: Number(card.querySelector('[name="rewardExperience"]').value || 0),
        maxExecutionSeconds: Number(card.querySelector('[name="maxExecutionSeconds"]').value || 8),
        objectives: card.querySelector('[name="objectives"]').value.trim(),
        description: card.querySelector('[name="description"]').value.trim(),
        knowledge: card.querySelector('[name="knowledge"]').value.trim(),
        requirements: card.querySelector('[name="requirements"]').value.trim(),
        testDescription: card.querySelector('[name="testDescription"]').value.trim(),
        evaluationConfig: {
          passPolicy: card.querySelector('[name="passPolicy"]').value,
          scoringRule: card.querySelector('[name="scoringRule"]').value,
          passingScore: Number(card.querySelector('[name="passingScore"]').value || 100),
          whitespacePolicy: card.querySelector('[name="whitespacePolicy"]').value,
          caseSensitive: card.querySelector('[name="caseSensitive"]').checked,
          studentFiles: [...card.querySelectorAll('[name="studentFiles"]:checked')].map((input) => input.value),
          executionFile: "平台内置安全评测器",
          outputType: card.querySelector('[name="outputType"]').value,
          fillBlankAnswer: card.querySelector('[name="fillBlankAnswer"]').value.trim(),
          tests,
          referenceAnswers,
        },
      };
    });
    if (!String(data.get("name") || "").trim()) return reportLabFormIssue(form.querySelector('[name="name"]'), "请先填写实验名称");
    if (!data.get("builtIn")) return reportLabFormIssue(form.querySelector('[name="builtIn"]'), "请选择实验运行环境");
    if (!checkpoints.length) return toast("实践项目至少需要一个关卡");
    const checkpointCards = [...form.querySelectorAll(".checkpoint-card")];
    const missingCheckpointIndex = checkpoints.findIndex((checkpoint) => !checkpoint.name || !checkpoint.objectives || !checkpoint.description || !checkpoint.requirements);
    if (missingCheckpointIndex >= 0) {
      const card = checkpointCards[missingCheckpointIndex];
      const target = [...card.querySelectorAll('[name="checkpointName"], [name="objectives"], [name="description"], [name="requirements"]')].find((input) => !input.value.trim());
      return reportLabFormIssue(target || card, `请完整填写第 ${missingCheckpointIndex + 1} 关的名称、目标、任务说明和操作要求`);
    }
    const missingTestsIndex = checkpoints.findIndex((checkpoint) => !checkpoint.evaluationConfig.tests.length || checkpoint.evaluationConfig.tests.some((test) => !test.name));
    if (missingTestsIndex >= 0) return reportLabFormIssue(checkpointCards[missingTestsIndex]?.querySelector(".evaluation-tests"), `第 ${missingTestsIndex + 1} 关至少需要一条有名称的自动测试`);
    const missingOutputIndex = checkpoints.findIndex((checkpoint) => checkpoint.evaluationConfig.tests.some((test) => /^program-output-/.test(test.ruleType) && !String(test.expected || "").trim()));
    if (missingOutputIndex >= 0) return reportLabFormIssue(checkpointCards[missingOutputIndex]?.querySelector('[name="testExpected"]'), `第 ${missingOutputIndex + 1} 关的程序输出测试必须填写最后一次正确运行的完整输出结果`);
    const hasCodeBlank = initialFiles.some((file) => !file.readOnly && file.content.includes("__BLANK__"));
    const missingBlankAnswerIndex = hasCodeBlank ? checkpoints.findIndex((checkpoint) => !checkpoint.evaluationConfig.fillBlankAnswer) : -1;
    if (missingBlankAnswerIndex >= 0) return reportLabFormIssue(checkpointCards[missingBlankAnswerIndex]?.querySelector('[name="fillBlankAnswer"]'), `代码模板含有 __BLANK__，请填写第 ${missingBlankAnswerIndex + 1} 关补全后的完整正确答案`);
    if (checkpoints.some((checkpoint) => checkpoint.evaluationConfig.tests.some((test) => /(^|\/)\.\.($|\/)|^\//.test(test.target)))) return toast("测试目标只能使用实验工作目录内的相对路径");
    if (checkpoints.some((checkpoint) => checkpoint.evaluationConfig.tests.reduce((sum, test) => sum + test.weight, 0) > 100)) return toast("单个关卡的测试权重总和不能超过 100");
    const oldRepository = normalizedRepository(existing || {});
    const commitMessage = data.get("commitMessage").trim() || "更新实验仓库";
    const repositoryRevision = existing ? oldRepository.revision : 0;
    const first = checkpoints[0];
    const lab = {
      ...(existing || {}),
      id: existing?.id || uid("lab"),
      name: data.get("name").trim(),
      mode: data.get("mode"),
      difficulty: first.difficulty,
      techPlatform: data.get("techPlatform"),
      language: data.get("language").trim(),
      publicScope: data.get("publicScope"),
      publicReviewStatus: data.get("publicScope") === "申请公开" ? (existing?.publicScope === "申请公开" ? existing.publicReviewStatus || "待审核" : "待审核") : "",
      duration: Number(data.get("duration")),
      maxExecutionSeconds: first.maxExecutionSeconds,
      objectives: first.objectives,
      description: first.description,
      knowledge: first.knowledge,
      requirements: first.requirements,
      testDescription: first.testDescription,
      skillTags: splitList(data.get("skillTags")),
      rewardExperience: first.rewardExperience,
      initialFiles,
      repository: {
        ...oldRepository,
        branch: data.get("repositoryBranch").trim() || "main",
        revision: repositoryRevision,
        commitMessage,
        files: initialFiles,
        commits: oldRepository.commits,
      },
      checkpoints,
      builtIn: data.get("builtIn") || "",
      evaluationConfig: first.evaluationConfig,
      state: existing?.state || "草稿",
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (existing) store.labs[store.labs.findIndex((item) => item.id === id)] = lab;
    else store.labs.unshift(lab);
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = "正在保存到服务器…"; }
    const saveResult = await saveStore();
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = "保存实验模板"; }
    if (!saveResult.saved) return;
    closeModal();
    render();
    return toast(existing ? "实验模板已更新" : "实验模板已创建");
  }
  if (type === "stage") {
    const data = new FormData(form);
    const course = store.courses.find((item) => item.id === data.get("courseId"));
    if (!course) return toast("课程不存在");
    course.stages = course.stages || [];
    const stageId = data.get("stageId");
    const stage = { id: stageId || uid("stage"), name: data.get("name").trim(), type: data.get("type"), description: data.get("description").trim(), objectives: data.get("objectives").trim(), content: data.get("content").trim(), lectureId: data.get("lectureId") || "", labId: data.get("labId") || "", resourceIds: data.getAll("resourceIds"), knowledgePointIds: data.getAll("knowledgePointIds"), parentId: data.get("parentId") || "", unlockRule: data.get("unlockRule"), estimatedMinutes: Number(data.get("estimatedMinutes") || 0), visibility: data.get("visibility") };
    const existingIndex = course.stages.findIndex((item) => item.id === stageId);
    if (existingIndex >= 0) course.stages[existingIndex] = stage;
    else course.stages.push(stage);
    course.updatedAt = new Date().toISOString();
    const result = await saveStore();
    if (!result.saved) return;
    closeModal();
    render();
    return toast(existingIndex >= 0 ? "课程阶段已更新" : "课程阶段已创建");
  }
  if (type === "lecture") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    if (!course.id) return toast("课程不存在");
    const lectureId = data.get("lectureId");
    const lecture = { id: lectureId || uid("lecture"), name: data.get("name").trim(), scheduledAt: data.get("scheduledAt"), mode: data.get("mode"), description: data.get("description").trim(), updatedAt: new Date().toISOString() };
    const index = course.lectures.findIndex((item) => item.id === lectureId);
    if (index >= 0) course.lectures[index] = { ...course.lectures[index], ...lecture };
    else course.lectures.push({ ...lecture, createdAt: new Date().toISOString() });
    saveStore(); closeModal(); render(); return toast(index >= 0 ? "讲次已更新" : "讲次已创建");
  }
  if (type === "member") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    if (!course.id) return toast("课程不存在");
    const memberId = data.get("memberId");
    const names = String(data.get("names") || "").split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
    if (!names.length) return toast("请输入成员姓名");
    if (memberId) {
      const member = course.members.find((item) => item.id === memberId);
      if (!member) return toast("成员不存在");
      Object.assign(member, { name: names[0], role: data.get("role"), classId: data.get("classId") || "", status: data.get("status"), identifier: data.get("identifier").trim(), email: data.get("email").trim(), note: data.get("note").trim(), updatedAt: new Date().toISOString() });
    } else {
      names.forEach((name, index) => course.members.push({ id: uid("member"), name, role: data.get("role"), classId: data.get("classId") || "", status: data.get("status"), identifier: index === 0 ? data.get("identifier").trim() : "", email: index === 0 ? data.get("email").trim() : "", note: data.get("note").trim(), joinedAt: new Date().toISOString() }));
    }
    saveStore(); closeModal(); render(); return toast(memberId ? "成员信息已更新" : `已添加 ${names.length} 名成员`);
  }
  if (type === "section") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    if (!course.id) return toast("课程不存在");
    const sectionId = data.get("sectionId");
    const section = { id: sectionId || uid("section"), name: data.get("name").trim(), code: data.get("code").trim(), teacherName: data.get("teacherName").trim(), description: data.get("description").trim(), updatedAt: new Date().toISOString() };
    const index = course.sections.findIndex((item) => item.id === sectionId);
    if (index >= 0) course.sections[index] = { ...course.sections[index], ...section };
    else course.sections.push({ ...section, createdAt: new Date().toISOString() });
    saveStore(); closeModal(); render(); return toast(index >= 0 ? "班级已更新" : "班级已创建");
  }
  if (type === "assignmentGroup") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    const assignment = course.assignments.find((item) => item.id === data.get("assignmentId") && item.type === "分组作业");
    if (!assignment) return toast("请选择有效的分组作业");
    const groupId = data.get("groupId");
    const memberIds = data.getAll("memberIds");
    if (!memberIds.length) return toast("请至少选择一名组员");
    if (memberIds.length > Number(assignment.groupSize || 5)) return toast(`该作业每组最多 ${assignment.groupSize || 5} 人`);
    const conflict = course.assignmentGroups.find((group) => group.id !== groupId && group.assignmentId === assignment.id && memberIds.some((memberId) => (group.memberIds || []).includes(memberId)));
    if (conflict) return toast(`所选学生已加入“${conflict.name}”`);
    const memberNames = memberIds.map((memberId) => course.members.find((member) => (member.accountId || member.id) === memberId)?.name || memberId);
    const existing = course.assignmentGroups.find((item) => item.id === groupId) || {};
    const group = { ...existing, id: groupId || uid("assignment-group"), assignmentId: assignment.id, name: data.get("name").trim(), memberIds, memberNames, createdAt: existing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const index = course.assignmentGroups.findIndex((item) => item.id === groupId);
    if (index >= 0) course.assignmentGroups[index] = group; else course.assignmentGroups.push(group);
    saveStore(); closeModal(); render(); return toast(index >= 0 ? "作业小组已更新" : "作业小组已创建");
  }
  if (type === "message") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    try {
      const response = await fetch(`${apiBase}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: course.id, senderId: store.role === "student" ? currentStudentId() : "course-teacher", senderName: store.role === "student" ? currentStudentName() : store.sessionUser?.name || "课程教师", senderRole: store.role, recipientId: data.get("recipientId"), subject: data.get("subject").trim(), content: data.get("content").trim() }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || "消息发送失败"); course.messages.unshift(body.message);
      closeModal(); render(); return toast("消息已发送");
    } catch (error) { return toast(error.message || "消息发送失败"); }
  }
  if (type === "survey") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    if (!course.id) return toast("课程不存在");
    const questions = [...form.querySelectorAll(".survey-question-row")].map((row) => ({ id: row.dataset.questionId || uid("survey-question"), type: row.querySelector('[name="surveyQuestionType"]').value, title: row.querySelector('[name="surveyQuestionTitle"]').value.trim(), options: row.querySelector('[name="surveyQuestionOptions"]').value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean), required: row.querySelector('[name="surveyQuestionRequired"]').checked }));
    if (!questions.length || questions.some((question) => !question.title)) return toast("问卷题目不能为空");
    if (questions.some((question) => ["单选题", "多选题"].includes(question.type) && question.options.length < 2)) return toast("选择题至少需要两个选项");
    const surveyId = data.get("surveyId");
    const existing = course.surveys.find((item) => item.id === surveyId) || {};
    const survey = { ...existing, id: surveyId || uid("survey"), title: data.get("title").trim(), startAt: data.get("startAt"), dueAt: data.get("dueAt"), anonymous: data.has("anonymous"), allowResubmit: data.has("allowResubmit"), description: data.get("description").trim(), questions, status: existing.status || "草稿", createdAt: existing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const index = course.surveys.findIndex((item) => item.id === surveyId);
    if (index >= 0) course.surveys[index] = survey; else course.surveys.unshift(survey);
    saveStore(); closeModal(); render(); return toast(index >= 0 ? "问卷已更新" : "问卷已创建");
  }
  if (type === "surveyResponse") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    const survey = course.surveys.find((item) => item.id === data.get("surveyId"));
    if (!survey) return toast("问卷不存在");
    const answers = {};
    (survey.questions || []).forEach((question) => { const values = data.getAll(`survey-answer-${question.id}`).map((value) => String(value).trim()).filter(Boolean); answers[question.id] = question.type === "多选题" ? values : values[0] || ""; });
    try {
      if (apiBase) {
        const response = await fetch(`${apiBase}/surveys/respond`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: course.id, surveyId: survey.id, studentId: currentStudentId(), studentName: currentStudentName(), answers }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.message || "问卷提交失败");
        const index = course.surveyResponses.findIndex((item) => item.id === body.response.id); if (index >= 0) course.surveyResponses[index] = body.response; else course.surveyResponses.unshift(body.response);
      } else {
        const existing = course.surveyResponses.find((item) => item.surveyId === survey.id && item.studentId === currentStudentId()); if (existing && !survey.allowResubmit) throw new Error("该问卷不允许重复提交");
        const response = { ...(existing || {}), id: existing?.id || uid("survey-response"), courseId: course.id, surveyId: survey.id, studentId: currentStudentId(), studentName: survey.anonymous ? "匿名学生" : currentStudentName(), answers, submittedAt: existing?.submittedAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
        if (existing) course.surveyResponses[course.surveyResponses.indexOf(existing)] = response; else course.surveyResponses.unshift(response); saveStore();
      }
      closeModal(); render(); return toast("问卷已提交");
    } catch (error) { return toast(error.message || "问卷提交失败"); }
  }
  if (type === "discussionReply") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    try {
      if (apiBase) {
        const response = await fetch(`${apiBase}/discussions/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: course.id, discussionId: data.get("discussionId"), studentId: currentStudentId(), studentName: currentStudentName(), content: data.get("content").trim() }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.message || "回复发布失败"); course.discussionReplies.push(body.reply);
      } else { course.discussionReplies.push({ id: uid("discussion-reply"), courseId: course.id, discussionId: data.get("discussionId"), studentId: currentStudentId(), studentName: currentStudentName(), content: data.get("content").trim(), createdAt: new Date().toISOString() }); saveStore(); }
      closeModal(); render(); return toast("回复已发布");
    } catch (error) { return toast(error.message || "回复发布失败"); }
  }
  if (type === "attendance") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    if (!course.id) return toast("课程不存在");
    const sessionId = data.get("sessionId");
    const existing = course.attendanceSessions.find((item) => item.id === sessionId) || {};
    const session = { ...existing, id: sessionId || uid("attendance"), title: data.get("title").trim(), code: data.get("code").trim(), durationMinutes: Number(data.get("durationMinutes") || 10), scheduledAt: data.get("scheduledAt"), sectionId: data.get("sectionId") || "", description: data.get("description").trim(), status: existing.status || "草稿", createdAt: existing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
    const duplicateCode = course.attendanceSessions.some((item) => item.id !== session.id && item.status === "进行中" && item.code === session.code);
    if (duplicateCode) return toast("当前课程已有相同签到码正在使用");
    const index = course.attendanceSessions.findIndex((item) => item.id === sessionId);
    if (index >= 0) course.attendanceSessions[index] = session; else course.attendanceSessions.unshift(session);
    saveStore(); closeModal(); render(); return toast(index >= 0 ? "签到已更新" : "签到已创建，可开始签到");
  }
  if (type === "attendanceCheckIn") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    try {
      if (apiBase) {
        const response = await fetch(`${apiBase}/attendance/check-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: course.id, sessionId: data.get("sessionId"), code: data.get("code").trim(), studentId: currentStudentId(), studentName: currentStudentName() }) });
        const body = await response.json(); if (!response.ok) throw new Error(body.message || "签到失败"); course.attendanceRecords.push(body.record);
      } else {
        const session = course.attendanceSessions.find((item) => item.id === data.get("sessionId"));
        if (!session || session.status !== "进行中") throw new Error("签到尚未开始或已结束");
        if (session.code !== data.get("code").trim()) throw new Error("签到码错误");
        if (course.attendanceRecords.some((item) => item.sessionId === session.id && item.studentId === currentStudentId())) throw new Error("你已完成本次签到");
        const deadline = new Date(session.startedAt || Date.now()).getTime() + Number(session.durationMinutes || 10) * 60000;
        course.attendanceRecords.push({ id: uid("attendance-record"), courseId: course.id, sessionId: session.id, studentId: currentStudentId(), studentName: currentStudentName(), checkedInAt: new Date().toISOString(), late: Date.now() > deadline }); saveStore();
      }
      closeModal(); render(); return toast("签到成功");
    } catch (error) { return toast(error.message || "签到失败"); }
  }
  if (type === "peerReview") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    try {
      const response = await fetch(`${apiBase}/peer-reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: course.id, submissionId: data.get("submissionId"), reviewerId: currentStudentId(), reviewerName: currentStudentName(), score: Number(data.get("score")), comment: data.get("comment").trim() }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || "互评提交失败"); course.peerReviews.push(body.review);
      closeModal(); render(); return toast("互评已提交");
    } catch (error) { return toast(error.message || "互评提交失败"); }
  }
  if (type === "gradeAppeal") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    try {
      const response = await fetch(`${apiBase}/grade-appeals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: course.id, submissionId: data.get("submissionId"), studentId: currentStudentId(), reason: data.get("reason").trim() }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || "成绩申诉提交失败"); course.gradeAppeals.unshift(body.appeal);
      closeModal(); render(); return toast("成绩申诉已提交");
    } catch (error) { return toast(error.message || "成绩申诉提交失败"); }
  }
  if (type === "resolveAppeal") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    try {
      const response = await fetch(`${apiBase}/grade-appeals/resolve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: course.id, appealId: data.get("appealId"), decision: data.get("decision"), newScore: data.get("newScore"), response: data.get("response").trim() }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || "成绩申诉处理失败");
      const appealIndex = course.gradeAppeals.findIndex((item) => item.id === body.appeal.id); if (appealIndex >= 0) course.gradeAppeals[appealIndex] = body.appeal;
      const submissionIndex = course.submissions.findIndex((item) => item.id === body.submission.id); if (submissionIndex >= 0) course.submissions[submissionIndex] = body.submission;
      closeModal(); render(); return toast("成绩申诉已处理");
    } catch (error) { return toast(error.message || "成绩申诉处理失败"); }
  }
  if (type === "roleApplication") {
    const data = new FormData(form);
    try {
      const response = await fetch(`${apiBase}/classrooms/role-application`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: data.get("courseId"), studentId: currentStudentId(), requestedRole: data.get("requestedRole"), reason: data.get("reason").trim() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "角色申请提交失败");
      closeModal(); return toast("角色申请已提交，等待教师审核");
    } catch (error) { return toast(error.message || "角色申请提交失败"); }
  }
  if (type === "resource") {
    if (!(await ensureActiveSession())) return;
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    if (!course.id) return toast("课程不存在");
    const resourceId = data.get("resourceId");
    const existing = course.resources.find((item) => item.id === resourceId) || {};
    const file = data.get("resourceFile");
    let uploaded = null;
    try { if (file?.size) uploaded = await uploadResourceFile(file); } catch (error) { return toast(error.message || "教学文件上传失败"); }
    const versions = Array.isArray(existing.versions) ? [...existing.versions] : [];
    if (uploaded) versions.unshift({ ...uploaded, label: data.get("versionLabel").trim() || `版本 ${versions.length + 1}` });
    const resource = { id: resourceId || uid("resource"), name: data.get("name").trim(), type: data.get("type"), folder: data.get("folder").trim(), subtasks: Number(data.get("subtasks") || 1), url: uploaded?.url || data.get("url").trim() || existing.url || "", fileName: uploaded?.name || existing.fileName || "", fileSize: uploaded?.size || existing.fileSize || 0, versions, description: data.get("description").trim(), status: existing.status || "草稿", updatedAt: new Date().toISOString() };
    const index = course.resources.findIndex((item) => item.id === resourceId);
    if (index >= 0) course.resources[index] = { ...existing, ...resource };
    else course.resources.push({ ...resource, createdAt: new Date().toISOString() });
    saveStore(); closeModal(); render(); return toast(index >= 0 ? "资源已更新" : "资源已创建，可在阶段中绑定");
  }
  if (type === "knowledge") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    if (!course.id) return toast("课程不存在");
    const knowledgeId = data.get("knowledgeId");
    const point = { id: knowledgeId || uid("knowledge"), name: data.get("name").trim(), code: data.get("code").trim(), prerequisiteId: data.get("prerequisiteId") || "", description: data.get("description").trim(), updatedAt: new Date().toISOString() };
    const index = course.knowledgePoints.findIndex((item) => item.id === knowledgeId);
    if (index >= 0) course.knowledgePoints[index] = { ...course.knowledgePoints[index], ...point };
    else course.knowledgePoints.push({ ...point, createdAt: new Date().toISOString() });
    saveStore(); closeModal(); render(); return toast(index >= 0 ? "知识点已更新" : "知识点已创建");
  }
  if (type === "moduleItem") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    if (!course.id) return toast("课程不存在");
    const itemId = data.get("itemId");
    const item = { id: itemId || uid("module-item"), moduleId: data.get("moduleId"), title: data.get("title").trim(), scheduledAt: data.get("scheduledAt"), url: data.get("url").trim(), completionRule: data.get("completionRule"), subtasks: Number(data.get("subtasks") || 1), description: data.get("description").trim(), status: course.moduleItems.find((entry) => entry.id === itemId)?.status || "草稿", updatedAt: new Date().toISOString() };
    const index = course.moduleItems.findIndex((entry) => entry.id === itemId);
    if (index >= 0) course.moduleItems[index] = { ...course.moduleItems[index], ...item };
    else course.moduleItems.unshift({ ...item, createdAt: new Date().toISOString() });
    saveStore(); closeModal(); render(); return toast(index >= 0 ? "模块内容已更新" : "模块内容已创建");
  }
  if (type === "submission") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    if (!course.id) return toast("课程不存在");
    const task = (data.get("kind") === "exam" ? course.exams : course.assignments).find((item) => item.id === data.get("activityId"));
    const answers = {};
    if (data.get("kind") === "exam") examQuestions(task || {}).forEach(({ question }) => { const values = data.getAll(`answer-${question.id}`).map((value) => String(value).trim()).filter(Boolean); answers[question.id] = question.type === "多选题" ? values : values[0] || ""; });
    const group = data.get("groupId") ? course.assignmentGroups.find((item) => item.id === data.get("groupId")) : null;
    const payload = { courseId: course.id, activityId: data.get("activityId"), kind: data.get("kind"), studentId: currentStudentId(), studentName: currentStudentName(), groupId: group?.id || "", content: data.get("content").trim(), attachmentUrl: data.get("attachmentUrl").trim(), answers };
    try {
      if (apiBase) {
        const response = await fetch(`${apiBase}/submissions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "提交失败");
        const index = course.submissions.findIndex((item) => item.id === body.submission.id);
        if (index >= 0) course.submissions[index] = body.submission; else course.submissions.unshift(body.submission);
        if (body.studentProgress) store.studentProgress = { ...defaultStore.studentProgress, ...body.studentProgress, resourceProgress: body.studentProgress.resourceProgress || {}, history: body.studentProgress.history || [] };
      } else {
        const submissionIdentity = group ? `group:${group.id}` : payload.studentId;
        const existing = course.submissions.find((item) => item.activityId === payload.activityId && item.studentId === submissionIdentity);
        const automatic = payload.kind === "exam" ? gradeObjectiveQuestions(task, answers) : { score: null, manualReview: true, results: {} };
        const hasQuestions = payload.kind === "exam" && (task?.questionRefs || []).length > 0;
        const needsManualReview = automatic.manualReview || !hasQuestions || (task?.labReferences || []).length > 0;
        const submissionStatus = payload.kind === "assignment" ? "已提交" : needsManualReview ? "待批阅" : "已批阅";
        const submission = { ...(existing || {}), ...payload, id: existing?.id || uid("submission"), studentId: submissionIdentity, studentName: group?.name || payload.studentName, submittedById: payload.studentId, submittedByName: payload.studentName, groupId: group?.id || "", groupMemberIds: group?.memberIds || [], status: submissionStatus, score: hasQuestions ? automatic.score : null, questionResults: automatic.results, feedback: hasQuestions ? (needsManualReview ? "客观题已自动判分，主观题或实践题等待教师批阅" : "客观题自动评测完成") : "", submittedAt: new Date().toISOString(), gradedAt: payload.kind === "exam" && !needsManualReview ? new Date().toISOString() : "", updatedAt: new Date().toISOString() };
        if (existing) course.submissions[course.submissions.indexOf(existing)] = submission; else course.submissions.unshift(submission);
        await updateResourceProgress(course.id, payload.activityId, "已完成");
        saveStore();
      }
      closeModal(); render(); return toast("任务已提交，等待教师批阅");
    } catch (error) { return toast(error.message || "提交失败"); }
  }
  if (type === "grade") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    if (!course.id) return toast("课程不存在");
    const payload = { courseId: course.id, submissionId: data.get("submissionId"), score: Number(data.get("score")), feedback: data.get("feedback").trim() };
    try {
      if (apiBase) {
        const response = await fetch(`${apiBase}/submissions/grade`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "批阅保存失败");
        const index = course.submissions.findIndex((item) => item.id === body.submission.id);
        if (index >= 0) course.submissions[index] = body.submission;
      } else {
        const submission = course.submissions.find((item) => item.id === payload.submissionId);
        if (!submission) throw new Error("提交记录不存在");
        const now = new Date().toISOString();
        submission.gradeHistory ||= [];
        if (submission.score != null || submission.feedback) submission.gradeHistory.unshift({ score: submission.score, feedback: submission.feedback || "", changedAt: now, changedBy: store.settings.teacherName || "教师" });
        Object.assign(submission, { score: payload.score, feedback: payload.feedback, status: "已批阅", gradedAt: now, updatedAt: now });
        saveStore();
      }
      closeModal(); render(); return toast("批阅结果已保存");
    } catch (error) { return toast(error.message || "批阅保存失败"); }
  }
  if (type === "activity") {
    const data = new FormData(form);
    const course = ensureCourseCollections(store.courses.find((item) => item.id === data.get("courseId")) || {});
    if (!course.id) return toast("课程不存在");
    const kind = data.get("kind");
    const key = { notice: "notices", assignment: "assignments", exam: "exams", discussion: "discussions" }[kind];
    if (!key) return toast("内容类型不正确");
    const itemId = data.get("itemId");
    const existingActivity = course[key].find((entry) => entry.id === itemId) || {};
    const description = String(data.get("description") || "").trim();
    if (kind === "assignment" && !description) return toast("请填写作业内容");
    let assignmentUpload = null;
    const assignmentFile = data.get("assignmentFile");
    try { if (kind === "assignment" && assignmentFile?.size) assignmentUpload = await uploadResourceFile(assignmentFile); } catch (error) { return toast(error.message || "作业附件上传失败"); }
    const labReferences = kind === "exam" ? data.getAll("labReferences").map((value) => {
      const [labId, checkpointId] = value.split(":");
      const lab = store.labs.find((entry) => entry.id === labId);
      const checkpoint = lab && normalizedCheckpoints(lab).find((entry) => entry.id === checkpointId);
      return { labId, checkpointId, commitSha: checkpoint?.repositoryRef?.commitSha || lab?.repository?.headCommit || "" };
    }) : [];
    let selectedQuestionIds = kind === "exam" ? data.getAll("questionIds") : [];
    const randomCount = kind === "exam" ? Number(data.get("randomQuestionCount") || 0) : 0;
    if (randomCount > 0) {
      const remaining = store.questionBank.filter((question) => !selectedQuestionIds.includes(question.id));
      for (let index = remaining.length - 1; index > 0; index -= 1) { const swap = Math.floor(Math.random() * (index + 1)); [remaining[index], remaining[swap]] = [remaining[swap], remaining[index]]; }
      selectedQuestionIds = [...selectedQuestionIds, ...remaining.slice(0, randomCount).map((question) => question.id)];
    }
    const questionRefs = selectedQuestionIds.map((questionId) => ({ questionId, score: Number(data.get(`questionScore-${questionId}`) || questionById(questionId)?.defaultScore || 5) }));
    const item = { id: itemId || uid(kind), title: data.get("title").trim(), type: data.get("type"), dueAt: data.get("dueAt"), publishedAt: data.get("dueAt"), startAt: data.get("startAt") || "", durationMinutes: Number(data.get("durationMinutes") || 0), maxAttempts: Number(data.get("maxAttempts") || 1), groupSize: Number(data.get("groupSize") || 1), allowLate: data.has("allowLate"), attachmentRequired: data.has("attachmentRequired"), plagiarismCheck: data.has("plagiarismCheck"), peerReview: data.has("peerReview"), anonymousReview: data.has("anonymousReview"), shuffleQuestions: data.has("shuffleQuestions"), showAnswersAfterClose: data.has("showAnswersAfterClose"), totalScore: Number(data.get("totalScore") || 0), description, requirements: kind === "assignment" ? String(data.get("requirements") || "").trim() : existingActivity.requirements || "", submissionInstructions: kind === "assignment" ? String(data.get("submissionInstructions") || "").trim() : existingActivity.submissionInstructions || "", referenceUrl: kind === "assignment" ? String(data.get("referenceUrl") || "").trim() : existingActivity.referenceUrl || "", assignmentAttachmentUrl: assignmentUpload?.url || existingActivity.assignmentAttachmentUrl || "", assignmentAttachmentName: assignmentUpload?.name || existingActivity.assignmentAttachmentName || "", questionRefs, labReferences, status: existingActivity.status || "草稿", updatedAt: new Date().toISOString() };
    const index = course[key].findIndex((entry) => entry.id === itemId);
    if (index >= 0) course[key][index] = { ...course[key][index], ...item };
    else course[key].unshift({ ...item, createdAt: new Date().toISOString() });
    saveStore(); closeModal(); render(); return toast(index >= 0 ? "教学内容已更新" : "教学内容已创建");
  }
  if (type === "classroom") {
    const data = new FormData(form);
    const course = store.courses.find((item) => item.id === data.get("courseId"));
    if (!course) return toast("课程不存在");
    if (course.status === "草稿") return toast("请先发布课程，再发送至教学课堂");
    course.classrooms = course.classrooms || [];
    course.classrooms.push({ id: uid("classroom"), name: data.get("name").trim(), inviteCode: data.get("inviteCode").trim(), endDate: data.get("endDate"), visibility: data.get("visibility"), access: data.get("access"), allowExit: data.has("allowExit"), showContacts: data.has("showContacts"), allowRoleApplication: data.has("allowRoleApplication"), closed: data.has("closed"), createdAt: new Date().toISOString() });
    course.updatedAt = new Date().toISOString();
    store.filters.courseWorkspaceTab = "overview";
    const result = await saveStore();
    if (!result.saved) return;
    closeModal();
    render();
    return toast("课程已发送至教学课堂");
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "terminalCapacityForm") {
    event.preventDefault();
    if (!apiBase) return toast("当前未通过服务器运行，无法保存容器分配");
    const form = event.target;
    const maxSessions = Number(new FormData(form).get("maxSessions"));
    if (!Number.isInteger(maxSessions) || maxSessions < 1 || maxSessions > 200) return toast("容器数量必须是 1 到 200 之间的整数");
    fetch(`${apiBase}/admin/terminal-capacity`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxSessions }) }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "容器分配保存失败");
      adminRuntime.terminal = body;
      render();
      toast(`已分配 ${maxSessions} 个可连接容器`);
    }).catch((error) => toast(error.message || "容器分配保存失败"));
    return;
  }
  if (event.target.id === "joinClassroomForm") {
    event.preventDefault();
    const form = event.target;
    const inviteCode = new FormData(form).get("inviteCode").trim();
    fetch(`${apiBase}/classrooms/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inviteCode, studentId: currentStudentId(), studentName: currentStudentName() }) }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "加入课堂失败");
      await loadServerData();
      store.selectedCourseId = body.courseId;
      store.page = "student-course";
      render();
      toast(`已加入课堂：${body.courseName}`);
    }).catch((error) => toast(error.message || "加入课堂失败"));
    return;
  }
  if (event.target.id === "accountCreateForm") {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    fetch(`${apiBase}/auth/accounts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(data)) }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "账号创建失败");
      form.reset();
      toast(`账号“${body.user.name}”已创建`);
    }).catch((error) => toast(error.message || "账号创建失败"));
    return;
  }
  if (event.target.id !== "settingsForm") return;
  event.preventDefault();
  const data = new FormData(event.target);
  store.settings.teacherName = data.get("teacherName").trim();
  store.settings.institution = data.get("institution").trim();
  saveStore();
  render();
  toast("教学设置已保存");
});

function showAuthScreen(setupRequired = false) {
  $("#authScreen").hidden = false;
  $("#authTitle").textContent = setupRequired ? "初始化平台管理员" : "登录学生实践平台";
  $("#authHint").textContent = setupRequired ? "首次运行需创建管理员账号，随后可在管理控制台创建教师和学生账号。" : "登录后将根据账号身份进入对应工作台。";
  $("#authSubmit").textContent = setupRequired ? "创建管理员并进入" : "登录";
  $("#authForm").dataset.setup = setupRequired ? "true" : "false";
}

async function initializePortal() {
  if (apiBase) {
    try {
      const response = await fetch(`${apiBase}/auth/session`, { cache: "no-store" });
      authState = await response.json();
      if (!authState.authenticated) return showAuthScreen(authState.setupRequired);
      const requestedRole = requestedView.get("role");
      if (authState.authRequired && ["teacher", "student", "admin"].includes(authState.user?.role)) store.role = authState.user.role;
      else if (!authState.authRequired && ["teacher", "student", "admin"].includes(requestedRole)) store.role = requestedRole;
    } catch {}
  }
  if (!(await loadServerData())) render();
  loadAdminRuntime();
}

$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const setup = form.dataset.setup === "true";
  $("#authError").textContent = "";
  try {
    const username = data.get("username");
    const response = await fetch(`${apiBase}/auth/${setup ? "setup" : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: data.get("password"), name: setup ? username : undefined }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || "登录失败");
    authState = { ...authState, authenticated: true, setupRequired: false, user: body.user };
    store.role = body.user.role;
    store.page = "home";
    $("#authScreen").hidden = true;
    if (!(await loadServerData())) render();
    loadAdminRuntime();
  } catch (error) { $("#authError").textContent = error.message || "登录失败"; }
});

$("#identityMenu").addEventListener("click", async () => {
  if (!authState.authRequired || !confirm(`确定退出账号“${authState.user?.name || "当前用户"}”吗？`)) return;
  await fetch(`${apiBase}/auth/logout`, { method: "POST" });
  authState = { authRequired: true, authenticated: false, setupRequired: false, user: null };
  showAuthScreen(false);
});

initializePortal();
