const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function cdpClient(port) {
  let list = [];
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      list = Array.isArray(response) ? response : [];
      if (list.find((item) => item.type === 'page' && item.url.includes('portal.html'))?.webSocketDebuggerUrl) break;
    } catch {}
    await wait(100);
  }
  const page = list.find((item) => item.type === 'page' && item.url.includes('portal.html'));
  if (!page?.webSocketDebuggerUrl) throw new Error('无法连接 Edge DevTools 页面');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    if (message.error) task.reject(new Error(message.error.message));
    else task.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await call('Runtime.enable');
  return { call, close: () => socket.close() };
}

async function evaluate(client, expression) {
  const result = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || '浏览器脚本执行失败');
  return result.result?.value;
}

test('教师端真实走通实验标准、课程创建、阶段编排、发布和课堂关联流程', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudlab-teacher-smoke-'));
  process.env.CLOUDLAB_DATA_FILE = path.join(temp, 'platform.json');
  const { server } = require(path.join(root, 'local-server.js'));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const webPort = server.address().port;
  const debugPort = await freePort();
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.join(temp, 'edge-profile')}`,
    `http://127.0.0.1:${webPort}/portal.html?role=teacher&page=home`,
  ], { windowsHide: true, stdio: 'ignore' });
  t.after(async () => {
    if (edge.exitCode == null) {
      edge.kill();
      await Promise.race([new Promise((resolve) => edge.once('close', resolve)), wait(3000)]);
    }
    await new Promise((resolve) => server.close(resolve));
    try { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
  });

  const client = await cdpClient(debugPort);
  t.after(() => client.close());
  await wait(500);
  const result = await evaluate(client, `
    (async () => {
      const set = (name, value) => { const node = document.querySelector('[name="' + name + '"]'); if (!node) throw new Error('missing ' + name); node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); };
      const submit = () => document.querySelector('#modalForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      for (let i = 0; i < 30 && !document.querySelector('[data-page="labs"]'); i += 1) await new Promise(r => setTimeout(r, 100));
      if (!document.querySelector('[data-page="labs"]')) throw new Error('teacher home did not render');
      document.querySelector('[data-page="labs"]').click();
      document.querySelector('[data-action="new-lab"]').click();
      set('name', '浏览器流程实验'); set('mode', '仅命令行'); set('difficulty', '初级'); set('duration', '20'); set('builtIn', 'linux-permissions'); set('objectives', '掌握文件创建与权限设置'); set('description', '创建文件并设置权限'); set('knowledge', 'Linux 文件权限'); set('requirements', '创建 notes.txt\\n将权限设置为 600'); set('testDescription', '公开测试用于练习，隐藏测试用于正式评测');
      submit();
      for (let i = 0; i < 50 && !document.querySelector('[data-action="edit-lab"]'); i += 1) await new Promise(r => setTimeout(r, 100));
      const labCreated = document.body.textContent.includes('浏览器流程实验');
      document.querySelector('[data-action="edit-lab"]').click();
      set('starterPath', 'frontend/title.js');
      set('starterContent', ['// 本关题目：补全去空格方法', 'function cleanTitle(title) { return String(title).__BLANK__(); }', ''].join(String.fromCharCode(10)));
      const readOnly = document.querySelector('[name="starterReadOnly"]'); if (readOnly) readOnly.checked = false;
      if (!document.querySelector('.reference-answer-row')) document.querySelector('[data-action="add-checkpoint-answer"]').click();
      set('answerName', '本关标准答案'); set('answerContent', '把 __BLANK__ 替换为 trim'); set('commitMessage', '教师修改填空题目和答案');
      submit();
      let teacherCanEditFill = false;
      for (let attempt = 0; attempt < 60 && !teacherCanEditFill; attempt += 1) {
        await new Promise(r => setTimeout(r, 200));
        const editedData = await (await fetch('/api/bootstrap')).json();
        const editedLab = editedData.labs.find(item => item.name === '浏览器流程实验');
        const editedFiles = editedLab?.repository?.files || editedLab?.initialFiles || [];
        teacherCanEditFill = editedFiles.some(file => file.path === 'frontend/title.js' && file.content.includes('__BLANK__')) && editedLab?.checkpoints?.[0]?.evaluationConfig?.referenceAnswers?.some(answer => answer.content === '把 __BLANK__ 替换为 trim');
      }
      document.querySelector('[data-action="toggle-lab-publish"]').click(); await new Promise(r => setTimeout(r, 250));
      const labPublished = document.body.textContent.includes('已发布');
      document.querySelector('[data-page="courses"]').click();
      document.querySelector('[data-action="new-course"]').click();
      set('name', '浏览器流程课程'); set('code', 'BROWSER-FLOW'); set('category', '软件工程'); set('term', '2026 春季'); set('startDate', '2026-03-01'); set('endDate', '2026-07-01'); set('totalHours', '32'); set('credits', '2'); set('learningObjectives', '掌握课程核心知识并完成实践'); set('summary', '课程创建流程冒烟测试'); set('targetAudience', '软件工程学生');
      for (const moduleId of ['assignment', 'exam', 'discussion', 'knowledge-graph', 'attendance']) { const input = document.querySelector('[name="modules"][value="' + moduleId + '"]'); input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); }
      submit(); await new Promise(r => setTimeout(r, 250));
      const created = document.querySelector('.view-head h1')?.textContent === '浏览器流程课程';
      document.querySelector('[data-action="new-stage"]').click();
      set('name', '第一章 课程基础'); set('type', '新建实践项目'); set('description', '基础内容'); set('objectives', '完成文件权限实验'); set('content', '本阶段先学习 Linux 工作目录，再依次使用 touch、chmod 与 stat 完成实践。');
      const labOption = document.querySelector('[name="labId"] option[value]:not([value=""])'); if (!labOption) throw new Error('missing lab option'); set('labId', labOption.value);
      submit(); await new Promise(r => setTimeout(r, 250));
      const staged = document.querySelectorAll('.stage-item').length === 1;
      document.querySelector('[data-action="toggle-course-publish"]').click(); await new Promise(r => setTimeout(r, 250));
      const published = document.body.textContent.includes('已发布');
      document.querySelector('[data-action="new-classroom"]').click();
      set('name', '浏览器流程课堂'); set('inviteCode', 'FLOW-2026'); set('endDate', '2026-07-15'); set('visibility', '私有课堂');
      submit(); await new Promise(r => setTimeout(r, 250));
      const classroom = document.querySelector('.classroom-list')?.textContent.includes('浏览器流程课堂');
      document.querySelector('[data-action="request-public"]').click(); await new Promise(r => setTimeout(r, 250));
      const publicPending = document.body.textContent.includes('公开申请中');
      document.querySelector('[data-action="course-workspace-tab"][data-tab="members"]').click();
      document.querySelector('[data-action="new-member"]').click();
      set('names', '学生甲\\n学生乙'); set('role', '学生'); set('status', '正常'); submit(); await new Promise(r => setTimeout(r, 250));
      const members = document.body.textContent.includes('学生甲') && document.body.textContent.includes('学生乙');
      document.querySelector('[data-action="course-workspace-tab"][data-tab="resources"]').click();
      document.querySelector('[data-action="new-resource"]').click();
      set('name', '课程导学资料'); set('type', '教学资料'); set('subtasks', '1'); set('description', '完成课程导学阅读'); submit(); await new Promise(r => setTimeout(r, 250));
      document.querySelector('[data-action="toggle-resource-publish"]').click(); await new Promise(r => setTimeout(r, 200));
      const resourcePublished = document.body.textContent.includes('课程导学资料') && document.body.textContent.includes('已发布');
      document.querySelector('[data-action="course-workspace-tab"][data-tab="plan"]').click();
      document.querySelector('[data-action="new-lecture"]').click();
      set('name', '第 1 讲 Linux 基础'); set('mode', '线上线下混合'); set('description', '课前预习与课中实践'); submit(); await new Promise(r => setTimeout(r, 250));
      document.querySelector('[data-action="edit-stage"]').click();
      const lectureOption = document.querySelector('[name="lectureId"] option[value]:not([value=""])'); if (!lectureOption) throw new Error('missing lecture option'); set('lectureId', lectureOption.value);
      const resourceCheck = document.querySelector('[name="resourceIds"]'); if (!resourceCheck) throw new Error('missing resource option'); resourceCheck.checked = true;
      submit(); await new Promise(r => setTimeout(r, 250));
      const planBound = document.querySelector('.lecture-card')?.textContent.includes('课程导学资料');
      document.querySelector('[data-action="course-workspace-tab"][data-tab="notices"]').click();
      document.querySelector('[data-action="new-activity"]').click();
      set('title', '开课通知'); set('description', '课程已经开放学习'); submit(); await new Promise(r => setTimeout(r, 250));
      document.querySelector('[data-action="toggle-activity-publish"]').click(); await new Promise(r => setTimeout(r, 200));
      const noticePublished = document.body.textContent.includes('开课通知') && document.body.textContent.includes('已发布');
      document.querySelector('[data-action="course-workspace-tab"][data-tab="assignments"]').click();
      document.querySelector('[data-action="new-activity"]').click(); set('title', '第一次图文作业'); set('type', '图文作业'); set('totalScore', '100'); set('description', '提交课程学习总结'); set('requirements', '总结不少于 800 字，并包含实验截图'); set('submissionInstructions', '提交正文和作品地址'); submit(); await new Promise(r => setTimeout(r, 200)); document.querySelector('[data-action="toggle-activity-publish"]').click(); await new Promise(r => setTimeout(r, 150));
      const assignmentPublished = document.body.textContent.includes('第一次图文作业') && document.body.textContent.includes('已发布');
      document.querySelector('[data-action="course-workspace-tab"][data-tab="exams"]').click();
      document.querySelector('[data-action="new-activity"]').click(); set('title', '第一单元考试'); set('type', '在线考试'); set('totalScore', '100'); set('description', '完成单元知识检查'); submit(); await new Promise(r => setTimeout(r, 200)); document.querySelector('[data-action="toggle-activity-publish"]').click(); await new Promise(r => setTimeout(r, 150));
      const examPublished = document.body.textContent.includes('第一单元考试') && document.body.textContent.includes('已发布');
      document.querySelector('[data-action="course-workspace-tab"][data-tab="discussions"]').click();
      document.querySelector('[data-action="new-activity"]').click(); set('title', 'Linux 权限讨论'); set('description', '分享文件权限使用场景'); submit(); await new Promise(r => setTimeout(r, 200)); document.querySelector('[data-action="toggle-activity-publish"]').click(); await new Promise(r => setTimeout(r, 150));
      const discussionPublished = document.body.textContent.includes('Linux 权限讨论') && document.body.textContent.includes('已发布');
      document.querySelector('[data-action="course-workspace-tab"][data-tab="knowledge"]').click();
      document.querySelector('[data-action="new-knowledge"]').click(); set('name', 'Linux 文件权限'); set('code', 'KP-LINUX-01'); set('description', '理解用户、用户组和权限位'); submit(); await new Promise(r => setTimeout(r, 200));
      const knowledgeCreated = document.body.textContent.includes('Linux 文件权限') && document.body.textContent.includes('KP-LINUX-01');
      document.querySelector('[data-action="course-workspace-tab"][data-tab="plan"]').click();
      document.querySelector('[data-action="edit-stage"]').click();
      const knowledgeCheck = document.querySelector('[name="knowledgePointIds"]'); if (!knowledgeCheck) throw new Error('missing knowledge option'); knowledgeCheck.checked = true;
      submit(); await new Promise(r => setTimeout(r, 200));
      document.querySelector('[data-action="course-workspace-tab"][data-tab="attendance"]').click();
      document.querySelector('[data-action="new-attendance"]').click(); set('title', '第 1 讲课堂签到'); set('scheduledAt', '2026-03-02T09:00'); set('description', '课堂开始后完成签到'); set('code', '260302'); submit(); await new Promise(r => setTimeout(r, 200));
      document.querySelector('[data-action="change-attendance-status"]').click(); await new Promise(r => setTimeout(r, 150));
      const extensionPublished = document.body.textContent.includes('第 1 讲课堂签到') && document.body.textContent.includes('进行中');
      document.querySelector('[data-action="course-workspace-tab"][data-tab="analytics"]').click();
      const analytics = document.body.textContent.includes('教学统计') && document.body.textContent.includes('学生学情明细');
      return { labCreated, teacherCanEditFill, labPublished, created, staged, published, classroom, publicPending, members, resourcePublished, planBound, noticePublished, assignmentPublished, examPublished, discussionPublished, knowledgeCreated, extensionPublished, analytics };
    })()
  `);
  assert.deepEqual(result, { labCreated: true, teacherCanEditFill: true, labPublished: true, created: true, staged: true, published: true, classroom: true, publicPending: true, members: true, resourcePublished: true, planBound: true, noticePublished: true, assignmentPublished: true, examPublished: true, discussionPublished: true, knowledgeCreated: true, extensionPublished: true, analytics: true });
  const syncDebug = await evaluate(client, `(async () => ({ local: JSON.parse(localStorage.getItem('cloudlab-local-data') || '{}').courses?.[0], remote: (await (await fetch('/api/bootstrap')).json()).courses?.[0] }))()`);
  const dataFile = path.join(temp, 'platform.json');
  let data;
  let lastCandidate;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const candidate = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      lastCandidate = candidate;
      if (candidate.courses?.[0]?.status === '公开申请中' && candidate.courses[0].classrooms?.[0] && candidate.courses[0].resources?.[0] && candidate.courses[0].members?.length === 2 && candidate.courses[0].knowledgePoints?.[0] && candidate.courses[0].attendanceSessions?.[0]?.status === '进行中') {
        data = candidate;
        break;
      }
    } catch {}
    await wait(100);
  }
  assert.ok(data, `教师端数据未在预期时间内完成持久化：${JSON.stringify({ file: lastCandidate?.courses?.[0] || {}, syncDebug })}`);
  assert.equal(data.courses.length, 1);
  assert.equal(data.courses[0].category, '软件工程');
  assert.equal(data.courses[0].learningObjectives, '掌握课程核心知识并完成实践');
  assert.equal(data.courses[0].stages.length, 1);
  assert.equal(data.courses[0].stages[0].content, '本阶段先学习 Linux 工作目录，再依次使用 touch、chmod 与 stat 完成实践。');
  assert.equal(data.courses[0].classrooms[0].inviteCode, 'FLOW-2026');
  assert.equal(data.courses[0].status, '公开申请中');
  assert.equal(data.courses[0].members.length, 2);
  assert.equal(data.courses[0].resources[0].status, '已发布');
  assert.equal(data.courses[0].lectures.length, 1);
  assert.equal(data.courses[0].stages[0].lectureId, data.courses[0].lectures[0].id);
  assert.equal(data.courses[0].assignments[0].description, '提交课程学习总结');
  assert.equal(data.courses[0].assignments[0].requirements, '总结不少于 800 字，并包含实验截图');
  assert.equal(data.courses[0].assignments[0].submissionInstructions, '提交正文和作品地址');
  assert.deepEqual(data.courses[0].stages[0].resourceIds, [data.courses[0].resources[0].id]);
  assert.equal(data.courses[0].notices[0].status, '已发布');
  assert.equal(data.courses[0].assignments[0].status, '已发布');
  assert.equal(data.courses[0].exams[0].status, '已发布');
  assert.equal(data.courses[0].discussions[0].status, '已发布');
  assert.equal(data.courses[0].knowledgePoints[0].name, 'Linux 文件权限');
  assert.deepEqual(data.courses[0].stages[0].knowledgePointIds, [data.courses[0].knowledgePoints[0].id]);
  assert.equal(data.courses[0].attendanceSessions[0].code, '260302');
  assert.equal(data.courses[0].attendanceSessions[0].status, '进行中');
  assert.equal(data.labs.length, 1);
  assert.equal(data.labs[0].state, '已发布');
  assert.equal(data.labs[0].objectives, '掌握文件创建与权限设置');
  assert.equal(data.labs[0].evaluationConfig.tests.filter((item) => item.visibility === 'hidden').length, 1);
  await client.call('Page.navigate', { url: `http://127.0.0.1:${webPort}/portal.html?role=student&page=student-course&courseId=${encodeURIComponent(data.courses[0].id)}` });
  await wait(700);
  const resourceView = await evaluate(client, `
    (async () => {
      for (let i = 0; i < 20 && !document.querySelector('[data-action="complete-resource"]'); i += 1) await new Promise(r => setTimeout(r, 100));
      const visible = Boolean(document.body.textContent.includes('课程导学资料') && document.body.textContent.includes('第 1 讲 Linux 基础') && document.body.textContent.includes('Linux 文件权限') && document.body.textContent.includes('查看具体学习内容') && document.querySelector('[data-tab="assignments"]') && document.querySelector('[data-tab="exams"]') && document.querySelector('[data-tab="discussion"]') && document.querySelector('[data-tab="attendance"]'));
      document.querySelector('[data-action="complete-resource"]')?.click();
      await new Promise(r => setTimeout(r, 400));
      return { visible, completed: document.body.textContent.includes('1/1') && document.body.textContent.includes('已完成') };
    })()
  `);
  assert.deepEqual(resourceView, { visible: true, completed: true });
  let progressSaved = false;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    if (candidate.studentProgress?.resourceProgress?.[data.courses[0].resources[0].id]?.status === '已完成') { progressSaved = true; break; }
    await wait(100);
  }
  assert.equal(progressSaved, true);
  const submitted = await evaluate(client, `
    (async () => {
      document.querySelector('[data-action="student-course-tab"][data-tab="assignments"]').click();
      await new Promise(r => setTimeout(r, 150));
      document.querySelector('[data-action="submit-activity"]').click();
      const content = document.querySelector('[name="content"]'); content.value = '已完成课程学习总结并说明权限设计。'; content.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#modalForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      for (let i = 0; i < 30 && !document.body.textContent.includes('已提交'); i += 1) await new Promise(r => setTimeout(r, 100));
      return document.body.textContent.includes('已提交');
    })()
  `);
  assert.equal(submitted, true);
  await client.call('Page.navigate', { url: `http://127.0.0.1:${webPort}/portal.html?role=teacher&page=course&courseId=${encodeURIComponent(data.courses[0].id)}` });
  await wait(700);
  const graded = await evaluate(client, `
    (async () => {
      for (let i = 0; i < 30 && !document.querySelector('[data-action="course-workspace-tab"][data-tab="submissions"]'); i += 1) await new Promise(r => setTimeout(r, 100));
      document.querySelector('[data-action="course-workspace-tab"][data-tab="submissions"]').click();
      await new Promise(r => setTimeout(r, 100));
      document.querySelector('[data-action="grade-submission"]').click();
      const score = document.querySelector('[name="score"]'); score.value = '95'; score.dispatchEvent(new Event('input', { bubbles: true }));
      const feedback = document.querySelector('[name="feedback"]'); feedback.value = '目标明确，提交内容完整。'; feedback.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#modalForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      for (let i = 0; i < 30 && !document.body.textContent.includes('95 / 100'); i += 1) await new Promise(r => setTimeout(r, 100));
      return document.body.textContent.includes('95 / 100') && document.body.textContent.includes('已批阅');
    })()
  `);
  assert.equal(graded, true);
  const gradedData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.equal(gradedData.courses[0].submissions[0].score, 95);
  assert.equal(gradedData.courses[0].submissions[0].feedback, '目标明确，提交内容完整。');
  await client.call('Page.navigate', { url: `http://127.0.0.1:${webPort}/index.html?labId=${encodeURIComponent(data.labs[0].id)}&returnPage=learning` });
  await wait(700);
  const studentView = await evaluate(client, `({
    title: document.querySelector('#labTitle')?.textContent,
    objective: document.querySelector('#labObjectives')?.textContent,
    requirements: document.querySelectorAll('#labRequirements li').length,
    tests: document.querySelectorAll('.test-case').length,
    hiddenRedacted: document.querySelector('#testBody')?.textContent.includes('隐藏测试（正式评测时执行）')
  })`);
  assert.deepEqual(studentView, { title: '浏览器流程实验', objective: '掌握文件创建与权限设置', requirements: 2, tests: 3, hiddenRedacted: true });
});
