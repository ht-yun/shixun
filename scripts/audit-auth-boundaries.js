/* 本地隔离诊断：打印权限和进度隔离的实际行为，不连接生产环境。 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'student-platform-audit-'));
  process.env.CLOUDLAB_DATA_FILE = path.join(directory, 'data.json');
  process.env.CLOUDLAB_AUTH_FILE = path.join(directory, 'auth.json');
  process.env.CLOUDLAB_AUTH_REQUIRED = 'true';
  delete process.env.CLOUDLAB_TERMINAL_ENABLED;
  const { server } = require('../local-server');
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, endpoint, body, cookie = '') => {
    const response = await fetch(`${base}${endpoint}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0] || '', data: await response.json() };
  };
  try {
    const admin = await request('POST', '/api/auth/setup', { username: 'audit-admin', name: '管理员', password: 'Audit-pass-2026' });
    const a = await request('POST', '/api/auth/accounts', { username: 'audit-student-a', name: '学生甲', password: 'Audit-pass-2026', role: 'student' }, admin.cookie);
    const b = await request('POST', '/api/auth/accounts', { username: 'audit-student-b', name: '学生乙', password: 'Audit-pass-2026', role: 'student' }, admin.cookie);
    const lab = { id: 'audit-lab', name: '诊断实验', state: '已发布', evaluationConfig: { tests: [{ id: 'hidden', name: '秘密用例', visibility: 'hidden', target: 'secret.txt', expected: 'secret' }], referenceAnswers: [{ id: 'answer', content: '仅教师保存的参考答案' }] }, checkpoints: [] };
    const course = { id: 'audit-course', name: '私有课程', visibility: '私有课程', status: '已发布', stages: [{ id: 'audit-stage', labId: 'audit-lab' }], members: [{ id: 'member-a', accountId: a.data.user.id, name: '学生甲', role: '学生' }], messages: [], surveys: [], discussions: [] };
    await request('PUT', '/api/bootstrap', { courses: [course], labs: [lab], settings: {} }, admin.cookie);
    const loginA = await request('POST', '/api/auth/login', { username: 'audit-student-a', password: 'Audit-pass-2026' });
    const loginB = await request('POST', '/api/auth/login', { username: 'audit-student-b', password: 'Audit-pass-2026' });
    const event = await request('POST', '/api/student-progress/events', { kind: '评测', title: '自报通过', passed: true, score: 100, labId: 'audit-lab' }, loginA.cookie);
    const otherProgress = await request('GET', '/api/student-progress', null, loginB.cookie);
    const otherBootstrap = await request('GET', '/api/bootstrap', null, loginB.cookie);
    const privateMessage = await request('POST', '/api/messages', { courseId: 'audit-course', recipientId: 'course-teachers', subject: '非成员消息', content: '诊断请求' }, loginB.cookie);
    console.log(JSON.stringify({
      selfReportedEvaluation: { status: event.status, score: event.data.score, passed: event.data.status },
      otherStudentProgress: { status: otherProgress.status, score: otherProgress.data.score, historyCount: otherProgress.data.history?.length },
      hiddenAnswers: { status: otherBootstrap.status, visibleCourses: otherBootstrap.data.courses?.length, visibleLabs: otherBootstrap.data.labs?.length, answerContent: otherBootstrap.data.labs?.[0]?.evaluationConfig?.referenceAnswers?.[0]?.content || null },
      privateCourseMessageByNonmember: { status: privateMessage.status },
    }, null, 2));
  } finally {
    await new Promise(resolve => server.close(resolve));
    const resolved = path.resolve(directory);
    if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('student-platform-audit-')) fs.rmSync(resolved, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
