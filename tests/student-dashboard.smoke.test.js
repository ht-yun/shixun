const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

async function connect(port) {
  let pages = [];
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      pages = Array.isArray(response) ? response : [];
      if (pages.some((page) => page.type === 'page' && page.url.includes('portal.html'))) break;
    } catch {}
    await wait(100);
  }
  const page = pages.find((item) => item.type === 'page' && item.url.includes('portal.html'));
  if (!page?.webSocketDebuggerUrl) throw new Error('无法连接学生端浏览器页面');
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

test('学生端展示真实进度看板、三列课程卡片和课程安排详情', async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudlab-student-smoke-'));
  const dataFile = path.join(temp, 'platform.json');
  const lab = { id: 'lab-linux', name: 'Linux 文件权限实验', description: '创建文件并设置权限', mode: '仅命令行', duration: 10, state: '已发布', builtIn: 'linux-permissions' };
  const makeCourse = (id, name, code) => ({
    id, name, code, category: '计算机与信息技术', term: '2026 秋季', startDate: '2026-09-01', endDate: '2027-01-10', totalHours: '32', credits: '2', summary: `${name}课程简介`, status: '已发布',
    stages: [
      { id: `${id}-stage-1`, name: '第一章 基础知识', type: '新建小节', description: '掌握课程基础概念', labId: '' },
      { id: `${id}-stage-2`, name: '第二章 实践训练', type: '新建实践项目', description: '完成在线实践任务', labId: 'lab-linux' },
    ],
  });
  fs.writeFileSync(dataFile, JSON.stringify({
    version: 2,
    courses: [makeCourse('course-a', 'Linux 系统基础', 'LINUX-01'), makeCourse('course-b', '数据库原理', 'DB-01'), makeCourse('course-c', '软件工程实践', 'SE-01')],
    labs: [lab],
    settings: { teacherName: '测试教师', institution: '测试学院' },
    studentProgress: { status: '进行中', score: null, attempts: 2, completedAt: '', lastActivityAt: '2026-11-03T02:00:00.000Z', history: [{ id: 'event-1', kind: '操作', title: '进入实验环境', detail: '已连接实验工作区', at: '2026-11-03T02:00:00.000Z' }] },
  }, null, 2), 'utf8');
  process.env.CLOUDLAB_DATA_FILE = dataFile;
  const { server } = require(path.join(root, 'local-server.js'));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const webPort = server.address().port;
  const debugPort = await freePort();
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new', '--disable-gpu', '--window-size=1600,1000', '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${path.join(temp, 'edge-profile')}`,
    `http://127.0.0.1:${webPort}/portal.html?role=student&page=home`,
  ], { windowsHide: true, stdio: 'ignore' });
  t.after(async () => {
    if (edge.exitCode == null) {
      edge.kill();
      await Promise.race([new Promise((resolve) => edge.once('close', resolve)), wait(3000)]);
    }
    await new Promise((resolve) => server.close(resolve));
    try { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
  });

  const client = await connect(debugPort);
  t.after(() => client.close());
  await wait(500);
  const result = await evaluate(client, `
    (async () => {
      for (let i = 0; i < 30 && !document.querySelector('.student-data-grid'); i += 1) await new Promise(r => setTimeout(r, 100));
      const dashboard = {
        metrics: document.querySelectorAll('.student-data-grid article').length,
        shortcuts: document.querySelectorAll('.student-shortcuts button').length,
        records: document.querySelectorAll('.dashboard-records article').length,
      };
      document.querySelector('[data-page="learning"]').click();
      await new Promise(r => setTimeout(r, 100));
      const grid = getComputedStyle(document.querySelector('.student-course-grid')).gridTemplateColumns.split(' ').length;
      const cards = document.querySelectorAll('.student-course-card').length;
      document.querySelector('[data-action="view-student-course"]').click();
      await new Promise(r => setTimeout(r, 100));
      const detail = {
        title: document.querySelector('.student-course-detail-hero h2')?.textContent,
        sections: document.querySelectorAll('.schedule-section').length,
        stageBlocks: document.querySelectorAll('.student-stage-block').length,
        tabs: document.querySelectorAll('.course-detail-tabs button').length,
        nav: document.querySelector('.nav-item.active')?.textContent.trim(),
      };
      document.querySelector('[data-action="student-course-tab"][data-tab="practice"]').click();
      await new Promise(r => setTimeout(r, 50));
      const practiceSections = document.querySelectorAll('.schedule-section').length;
      document.querySelector('[data-action="student-course-tab"][data-tab="discussion"]').click();
      await new Promise(r => setTimeout(r, 50));
      const discussionEmpty = Boolean(document.querySelector('.course-detail-empty'));
      return { dashboard, grid, cards, detail, practiceSections, discussionEmpty };
    })()
  `);
  assert.deepEqual(result, {
    dashboard: { metrics: 4, shortcuts: 4, records: 1 },
    grid: 3,
    cards: 3,
    detail: { title: 'Linux 系统基础', sections: 1, stageBlocks: 2, tabs: 4, nav: '▤课程学习' },
    practiceSections: 1,
    discussionEmpty: true,
  });
  const admin = await evaluate(client, `
    (async () => {
      document.querySelector('[data-role="admin"]').click();
      for (let i = 0; i < 30 && !document.querySelector('.admin-runtime-grid'); i += 1) await new Promise(r => setTimeout(r, 100));
      for (let i = 0; i < 30 && document.querySelector('.metric-value')?.textContent === '检查中'; i += 1) await new Promise(r => setTimeout(r, 100));
      return {
        metrics: [...document.querySelectorAll('.metric-value')].map(node => node.textContent.trim()),
        services: document.querySelectorAll('.runtime-list article').length,
        inventory: document.querySelectorAll('.admin-inventory tbody tr').length,
        status: document.querySelector('#platformStatus').textContent.trim(),
      };
    })()
  `);
  assert.deepEqual(admin, { metrics: ['3', '1', '0', '正常'], services: 5, inventory: 4, status: '平台服务正常' });
  await client.call('Page.navigate', { url: `http://127.0.0.1:${webPort}/index.html?returnPage=student-course&courseId=course-a` });
  await wait(800);
  const backTarget = await evaluate(client, `document.querySelector('#backToCourse').getAttribute('href')`);
  assert.equal(backTarget, 'portal.html?page=student-course&courseId=course-a');
  await evaluate(client, `document.querySelector('#backToCourse').click()`);
  await wait(500);
  const returnedCourse = await evaluate(client, `document.querySelector('.student-course-detail-hero h2')?.textContent`);
  assert.equal(returnedCourse, 'Linux 系统基础');
  await client.call('Page.navigate', { url: `http://127.0.0.1:${webPort}/index.html?returnPage=student-course&courseId=course-a` });
  await wait(500);
  let terminalFallback;
  for (let attempt = 0; attempt < 20 && !terminalFallback; attempt += 1) {
    try {
      terminalFallback = await evaluate(client, `
        (async () => {
          for (let i = 0; i < 30 && !document.querySelector('[data-tool-tab="terminal"]'); i += 1) await new Promise(r => setTimeout(r, 100));
          document.querySelector('[data-tool-tab="terminal"]').click();
          for (let i = 0; i < 30 && document.querySelector('#terminalFallback').hidden; i += 1) await new Promise(r => setTimeout(r, 100));
          return {
            fallbackVisible: !document.querySelector('#terminalFallback').hidden,
            hostHidden: document.querySelector('#terminalHost').hidden,
            meta: document.querySelector('#terminalMeta').textContent,
          };
        })()
      `);
    } catch (error) {
      if (!/context was destroyed/i.test(error.message)) throw error;
      await wait(150);
    }
  }
  assert.deepEqual(terminalFallback, { fallbackVisible: true, hostHidden: true, meta: 'bash · 受限命令回退模式' });
});
