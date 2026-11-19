const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('本地服务可持久化课程并记录真实学习进度', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudlab-test-'));
  const dataFile = path.join(temp, 'platform.json');
  process.env.CLOUDLAB_DATA_FILE = dataFile;
  delete process.env.CLOUDLAB_TERMINAL_ENABLED;
  const { server } = require(path.join(root, 'local-server.js'));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}`;

  let response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200, response.status === 200 ? undefined : await response.text());
  response = await fetch(`${base}/api/terminal/status`);
  let terminalStatus = await response.json();
  assert.equal(response.status, 200);
  assert.equal(terminalStatus.enabled, false);
  assert.equal(terminalStatus.limits.memoryMiB, 384);
  response = await fetch(`${base}/api/terminal/session`, { method: 'POST' });
  assert.equal(response.status, 503);
  response = await fetch(`${base}/api/bootstrap`);
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.courses, []);
  assert.deepEqual(body.labs, []);
  assert.equal(body.studentProgress.status, '未开始');

  const course = { id: 'course-1', name: '系统课程', code: 'SYS-01', status: '草稿', stages: [], resources: [{ id: 'resource-1', name: '课程导学', type: '教学资料', subtasks: 2, status: '已发布' }], assignments: [{ id: 'assignment-1', title: '学习总结', type: '图文作业', totalScore: 100, status: '已发布' }], exams: [], submissions: [] };
  response = await fetch(`${base}/api/bootstrap`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 2, courses: [course], labs: [], settings: { teacherName: '教师', institution: '学院' } }),
  });
  assert.equal(response.status, 200, response.status === 200 ? undefined : await response.text());
  assert.equal(fs.existsSync(dataFile), true);

  response = await fetch(`${base}/api/student-progress/resources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId: 'course-1', resourceId: 'resource-1', status: '已完成' }),
  });
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.resourceProgress['resource-1'].status, '已完成');
  assert.equal(body.resourceProgress['resource-1'].completedSubtasks, 2);

  response = await fetch(`${base}/api/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId: 'course-1', activityId: 'assignment-1', kind: 'assignment', studentId: 'student-current', studentName: '当前学生', content: '已完成课程学习总结。' }),
  });
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.submission.status, '已提交');
  const submissionId = body.submission.id;

  response = await fetch(`${base}/api/submissions/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId: 'course-1', submissionId, score: 92, feedback: '结构清晰，继续保持。' }),
  });
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.submission.status, '已批阅');
  assert.equal(body.submission.score, 92);

  response = await fetch(`${base}/api/student-progress/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: '评测', title: '提交正式评测', detail: '全部测试通过', passed: true }),
  });
  body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.status, '已完成');
  assert.equal(body.score, 100);
  assert.equal(body.attempts, 1);

  response = await fetch(`${base}/api/bootstrap`);
  body = await response.json();
  assert.equal(body.courses[0].code, 'SYS-01');
  assert.equal(body.courses[0].submissions[0].feedback, '结构清晰，继续保持。');
  assert.equal(body.studentProgress.history[0].title, '提交正式评测');

  response = await fetch(`${base}/portal.html`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /student-runtime\.css/);
  response = await fetch(`${base}/vendor/xterm.mjs`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/javascript/);
});
