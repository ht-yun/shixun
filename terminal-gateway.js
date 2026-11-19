const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { WebSocketServer, WebSocket } = require('ws');

const dockerSocket = process.env.CLOUDLAB_DOCKER_SOCKET || '/var/run/docker.sock';
const dockerApi = process.env.CLOUDLAB_DOCKER_API || '/v1.52';
const terminalImage = process.env.CLOUDLAB_TERMINAL_IMAGE || 'cloudlab-terminal:1';
const dockerBinary = process.env.CLOUDLAB_DOCKER_BIN || '/usr/bin/docker';
const enabled = process.env.CLOUDLAB_TERMINAL_ENABLED === 'true';
let maxSessions = clampNumber(process.env.CLOUDLAB_TERMINAL_MAX_SESSIONS, 1, 200, 10);
// 不再按 IP 把容器切成小配额；总容器数由管理员通过平台设置分配。
let maxSessionsPerIp = clampNumber(process.env.CLOUDLAB_TERMINAL_MAX_PER_IP, 0, 200, 0);
const idleTimeoutMs = clampNumber(process.env.CLOUDLAB_TERMINAL_IDLE_MINUTES, 1, 60, 10) * 60_000;
const maxLifetimeMs = clampNumber(process.env.CLOUDLAB_TERMINAL_MAX_MINUTES, 5, 120, 120) * 60_000;
const tokens = new Map();
const sessions = new Map();
const recentTokenRequests = new Map();
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}

// `find -printf %m` returns an octal mode such as 600 or 444.  The first
// digit is the owner's permission set, which is the only one that matters
// because the workspace files are owned by the cloudlab user.  Checking the
// last digit incorrectly makes an editable 600 file appear read-only.
function modeAllowsOwnerWrite(mode) {
  const parsed = Number.parseInt(String(mode || ''), 8);
  return Number.isInteger(parsed) && (parsed & 0o200) !== 0;
}

function configureCapacity(options = {}) {
  if (options.maxSessions !== undefined) maxSessions = clampNumber(options.maxSessions, 1, 200, maxSessions);
  if (options.maxSessionsPerIp !== undefined) maxSessionsPerIp = clampNumber(options.maxSessionsPerIp, 0, 200, maxSessionsPerIp);
  return { maxSessions, maxSessionsPerIp };
}

function safeWorkspacePath(value) {
  const target = String(value || '').trim().replace(/\\/g, '/');
  if (!/^[A-Za-z0-9._/-]{1,160}$/.test(target) || target.startsWith('/') || target.split('/').includes('..')) throw new Error('文件路径不安全');
  return target;
}

function normalizeLabProfile(lab = {}) {
  const platform = ['Linux', 'Python', 'Java', '数据库'].includes(lab.techPlatform) ? lab.techPlatform : 'Linux';
  const initialFiles = (Array.isArray(lab.initialFiles) ? lab.initialFiles : []).slice(0, 200).map((file) => ({
    path: safeWorkspacePath(file.path || file.name),
    content: String(file.content || '').slice(0, 1_000_000),
    readOnly: file.readOnly === true,
  }));
  return { labId: String(lab.id || '').slice(0, 128), platform, mode: String(lab.mode || '仅命令行'), durationMinutes: clampNumber(lab.duration, 5, maxLifetimeMs / 60_000, Math.min(120, maxLifetimeMs / 60_000)), initialFiles };
}

function defaultInitialFiles(profile) {
  if (profile.platform === 'Java') return [{ path: 'Main.java', content: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("学生实践平台 Java 环境已就绪");\n  }\n}\n', readOnly: false }];
  if (profile.platform === 'Python') return [{ path: 'main.py', content: 'print("学生实践平台 Python 环境已就绪")\n', readOnly: false }];
  if (profile.platform === '数据库') return [{ path: 'main.sql', content: 'CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY, name TEXT);\nSELECT name FROM sqlite_master WHERE type = \'table\';\n', readOnly: false }];
  return [{ path: 'README.md', content: '# 学生实践平台 Linux 实验\n\n请按照左侧任务说明在终端中完成实验。\n', readOnly: false }];
}

function clientIp(req) {
  const forwarded = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (forwarded || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

function activeForIp(ip) {
  let count = 0;
  for (const session of sessions.values()) if (session.ip === ip && !session.closed) count += 1;
  return count;
}

function cleanExpiredTokens() {
  const now = Date.now();
  for (const [token, entry] of tokens) if (entry.expiresAt <= now) tokens.delete(token);
  for (const [ip, times] of recentTokenRequests) {
    const current = times.filter((time) => time > now - 60_000);
    if (current.length) recentTokenRequests.set(ip, current);
    else recentTokenRequests.delete(ip);
  }
}

function dockerRequest(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : Buffer.from(JSON.stringify(body));
    const request = http.request({
      socketPath: dockerSocket,
      path: `${dockerApi}${pathname}`,
      method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {},
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try { resolve(raw ? JSON.parse(raw) : null); } catch { resolve(raw); }
          return;
        }
        const error = new Error(`Docker API ${method} ${pathname} failed (${response.statusCode}): ${raw.slice(0, 500)}`);
        error.statusCode = response.statusCode;
        reject(error);
      });
    });
    request.setTimeout(10_000, () => request.destroy(new Error('Docker API request timed out')));
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function dockerAttach(containerId) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath: dockerSocket,
      path: `${dockerApi}/containers/${containerId}/attach?stream=1&stdin=1&stdout=1&stderr=1`,
      method: 'POST',
      headers: { Connection: 'Upgrade', Upgrade: 'tcp' },
    });
    request.setTimeout(10_000, () => request.destroy(new Error('Docker attach timed out')));
    request.on('upgrade', (_response, socket, head) => resolve({ socket, head }));
    request.on('response', (response) => reject(new Error(`Docker attach failed (${response.statusCode})`)));
    request.on('error', reject);
    request.end();
  });
}

function containerConfig(sessionId, profile = normalizeLabProfile()) {
  const memoryMiB = profile.platform === 'Java' ? 384 : 256;
  return {
    Image: terminalImage,
    Cmd: ['/bin/bash', '--noprofile', '--norc', '-i'],
    Env: [
      'TERM=xterm-256color',
      'LANG=C.UTF-8',
      'HOME=/home/cloudlab',
      'HISTFILE=/home/cloudlab/workspace/.bash_history',
      'PS1=\\[\\e[32m\\]cloudlab@lab-node-01\\[\\e[0m\\]:\\[\\e[34m\\]\\w\\[\\e[0m\\]\\$ ',
      `CLOUDLAB_PLATFORM=${profile.platform}`,
    ],
    Hostname: 'lab-node-01',
    User: '10001:10001',
    WorkingDir: '/home/cloudlab/workspace',
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    OpenStdin: true,
    StdinOnce: false,
    Tty: true,
    Labels: { 'cloudlab.managed': 'true', 'cloudlab.session': sessionId },
    HostConfig: {
      AutoRemove: true,
      NetworkMode: 'none',
      ReadonlyRootfs: true,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],
      Memory: memoryMiB * 1024 * 1024,
      MemorySwap: memoryMiB * 1024 * 1024,
      NanoCpus: 250_000_000,
      PidsLimit: 64,
      ShmSize: 16 * 1024 * 1024,
      Ulimits: [{ Name: 'nofile', Soft: 256, Hard: 256 }],
      Tmpfs: {
        '/home/cloudlab/workspace': 'rw,noexec,nosuid,nodev,size=64m,uid=10001,gid=10001,mode=700',
        '/tmp': 'rw,noexec,nosuid,nodev,size=16m,uid=10001,gid=10001,mode=1777',
      },
    },
  };
}

async function terminalAvailable() {
  if (!enabled) return { available: false, reason: '交互终端服务未启用' };
  try {
    await dockerRequest('GET', '/_ping');
    await dockerRequest('GET', `/images/${encodeURIComponent(terminalImage)}/json`);
    return { available: true };
  } catch (error) {
    return { available: false, reason: error.message };
  }
}

async function issueToken(req, lab = {}) {
  cleanExpiredTokens();
  const availability = await terminalAvailable();
  if (!availability.available) return { status: 503, body: availability };
  const ip = clientIp(req);
  if (sessions.size >= maxSessions) return { status: 429, body: { message: '当前终端会话已满，请稍后重试' } };
  if (maxSessionsPerIp > 0 && activeForIp(ip) >= maxSessionsPerIp) return { status: 429, body: { message: '当前网络已达到终端会话上限' } };
  const now = Date.now();
  const requests = (recentTokenRequests.get(ip) || []).filter((time) => time > now - 60_000);
  if (requests.length >= 10) return { status: 429, body: { message: '请求过于频繁，请稍后重试' } };
  requests.push(now);
  recentTokenRequests.set(ip, requests);
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = now + 60_000;
  const profile = normalizeLabProfile(lab);
  tokens.set(token, { ip, expiresAt, profile });
  return {
    status: 201,
    body: {
      token,
      expiresAt: new Date(expiresAt).toISOString(),
      websocketPath: '/ws/terminal',
      profile: { platform: profile.platform, mode: profile.mode, durationMinutes: profile.durationMinutes },
      limits: { memoryMiB: profile.platform === 'Java' ? 384 : 256, cpu: 0.25, processes: 64, idleMinutes: idleTimeoutMs / 60_000, maxMinutes: profile.durationMinutes },
    },
  };
}

function rejectUpgrade(socket, status, message) {
  const body = JSON.stringify({ message });
  socket.end(`HTTP/1.1 ${status}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
}

function handleUpgrade(req, socket, head) {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); } catch { return rejectUpgrade(socket, '400 Bad Request', '无效请求'); }
  if (url.pathname !== '/ws/terminal') return;
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return rejectUpgrade(socket, '403 Forbidden', '跨站连接已拒绝');
    } catch { return rejectUpgrade(socket, '403 Forbidden', '来源无效'); }
  }
  const ip = clientIp(req);
  cleanExpiredTokens();
  const tokenValue = url.searchParams.get('token');
  const token = tokens.get(tokenValue);
  if (!token || token.expiresAt <= Date.now() || token.ip !== ip) return rejectUpgrade(socket, '401 Unauthorized', '终端令牌无效或已过期');
  tokens.delete(tokenValue);
  if (sessions.size >= maxSessions || (maxSessionsPerIp > 0 && activeForIp(ip) >= maxSessionsPerIp)) return rejectUpgrade(socket, '429 Too Many Requests', '终端会话已满');
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, { ip, profile: token.profile }));
}

async function removeContainer(containerId) {
  if (!containerId) return;
  try { await dockerRequest('DELETE', `/containers/${containerId}?force=1&v=1`); } catch (error) {
    if (error.statusCode !== 404) console.error('[terminal] container cleanup failed', error.message);
  }
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

async function closeSession(session, reason) {
  if (!session || session.closed) return;
  session.closed = true;
  clearTimeout(session.idleTimer);
  clearTimeout(session.lifetimeTimer);
  sessions.delete(session.id);
  try { session.stream?.destroy(); } catch {}
  await removeContainer(session.containerId);
  send(session.ws, { type: 'exit', reason });
  try { session.ws.close(1000, reason.slice(0, 120)); } catch {}
  console.log(JSON.stringify({ event: 'terminal-session-end', sessionId: session.id, ip: session.ip, reason, at: new Date().toISOString() }));
}

function armIdleTimer(session) {
  clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => closeSession(session, '会话因长时间无操作已关闭'), idleTimeoutMs);
  session.idleTimer.unref?.();
}

async function initializeWorkspace(session) {
  const files = session.profile.initialFiles.length ? session.profile.initialFiles : defaultInitialFiles(session.profile);
  for (const file of files) {
    const encoded = Buffer.from(file.content, 'utf8').toString('base64');
    const parent = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '.';
    await dockerExec(session.containerId, `mkdir -p -- '${parent}' && printf %s '${encoded}' | base64 -d > '${file.path}' && chmod ${file.readOnly ? '444' : '600'} -- '${file.path}'`);
  }
}

async function startSession(ws, ip, profile = normalizeLabProfile()) {
  const sessionId = crypto.randomUUID();
  const name = `cloudlab-terminal-${sessionId.slice(0, 12)}`;
  const session = { id: sessionId, ip, ws, name, containerId: null, stream: null, closed: false, profile };
  sessions.set(sessionId, session);
  armIdleTimer(session);
  session.lifetimeTimer = setTimeout(() => closeSession(session, '会话已达到最长运行时间'), profile.durationMinutes * 60_000);
  session.lifetimeTimer.unref?.();
  try {
    const created = await dockerRequest('POST', `/containers/create?name=${encodeURIComponent(name)}`, containerConfig(sessionId, profile));
    session.containerId = created.Id;
    if (session.closed) {
      await removeContainer(session.containerId);
      return;
    }
    const attached = await dockerAttach(session.containerId);
    session.stream = attached.socket;
    if (session.closed) {
      attached.socket.destroy();
      await removeContainer(session.containerId);
      return;
    }
    if (attached.head?.length) send(ws, { type: 'output', data: attached.head.toString('utf8') });
    attached.socket.on('data', (chunk) => send(ws, { type: 'output', data: chunk.toString('utf8') }));
    attached.socket.on('end', () => closeSession(session, '终端进程已结束'));
    attached.socket.on('error', (error) => closeSession(session, `终端连接中断：${error.message}`));
    await dockerRequest('POST', `/containers/${session.containerId}/start`);
    await initializeWorkspace(session);
    send(ws, {
      type: 'ready',
      sessionId,
      profile: { platform: profile.platform, mode: profile.mode },
      expiresAt: new Date(Date.now() + profile.durationMinutes * 60_000).toISOString(),
    });
    console.log(JSON.stringify({ event: 'terminal-session-start', sessionId, ip, containerId: session.containerId.slice(0, 12), at: new Date().toISOString() }));
  } catch (error) {
    send(ws, { type: 'error', message: '无法创建隔离终端，请稍后重试' });
    console.error('[terminal] session start failed', error);
    await closeSession(session, '终端启动失败');
  }
}

wss.on('connection', (ws, _req, context) => {
  let session;
  startSession(ws, context.ip, context.profile).then(() => {
    session = [...sessions.values()].find((item) => item.ws === ws);
  });
  ws.on('message', async (raw) => {
    session ||= [...sessions.values()].find((item) => item.ws === ws);
    if (!session || session.closed) return;
    let message;
    try { message = JSON.parse(raw.toString('utf8')); } catch { return; }
    if (message.type === 'input' && typeof message.data === 'string' && message.data.length <= 16_384) {
      armIdleTimer(session);
      session.stream?.write(message.data);
    } else if (message.type === 'resize') {
      const cols = clampNumber(message.cols, 20, 300, 100);
      const rows = clampNumber(message.rows, 5, 100, 30);
      if (session.containerId) dockerRequest('POST', `/containers/${session.containerId}/resize?h=${rows}&w=${cols}`).catch(() => {});
    }
  });
  ws.on('close', () => {
    session ||= [...sessions.values()].find((item) => item.ws === ws);
    closeSession(session, '浏览器连接已关闭');
  });
  ws.on('error', () => {});
});

function sessionForRequest(req) {
  const id = String(req.headers['x-terminal-session'] || '');
  const session = sessions.get(id);
  if (!session || session.closed || session.ip !== clientIp(req) || !session.containerId) return null;
  return session;
}

function dockerExec(containerId, script, timeout = 8_000) {
  return new Promise((resolve, reject) => {
    execFile(dockerBinary, ['exec', '--user', '10001:10001', containerId, 'bash', '-lc', script], { timeout, maxBuffer: 64 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error && error.killed) return reject(new Error('容器命令执行超时'));
      resolve({ code: error?.code ?? 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

async function listFiles(req) {
  const session = sessionForRequest(req);
  if (!session) return null;
  armIdleTimer(session);
  const result = await dockerExec(session.containerId, `find . -mindepth 1 -maxdepth 4 -type f -printf '%P\\t%s\\t%m\\n' | sort`, 8_000);
  const files = result.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const [path, size, mode] = line.split('\t');
    return { path, size: Number(size || 0), readOnly: !modeAllowsOwnerWrite(mode) };
  });
  return { files, platform: session.profile.platform };
}

async function readFile(req, pathValue) {
  const session = sessionForRequest(req);
  if (!session) return null;
  const path = safeWorkspacePath(pathValue);
  armIdleTimer(session);
  const result = await dockerExec(session.containerId, `test -f '${path}' && base64 -w0 -- '${path}'`, 8_000);
  if (result.code !== 0) throw new Error('文件不存在');
  const content = Buffer.from(result.stdout.trim(), 'base64').toString('utf8');
  if (Buffer.byteLength(content) > 100_000) throw new Error('编辑器仅支持 100 KB 以内的文本文件');
  return { path, content };
}

async function writeFile(req, pathValue, contentValue) {
  const session = sessionForRequest(req);
  if (!session) return null;
  const path = safeWorkspacePath(pathValue);
  const content = String(contentValue ?? '');
  if (Buffer.byteLength(content, 'utf8') > 100_000) throw new Error('文件内容不能超过 100 KB');
  armIdleTimer(session);
  const encoded = Buffer.from(content, 'utf8').toString('base64');
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
  const result = await dockerExec(session.containerId, `mkdir -p -- '${parent}' && { test ! -e '${path}' || test -w '${path}'; } && printf %s '${encoded}' | base64 -d > '${path}'`, 8_000);
  if (result.code !== 0) throw new Error('文件为只读或保存失败');
  return { path, saved: true, bytes: Buffer.byteLength(content, 'utf8') };
}

function defaultTests() {
  return [
    { id: 'workspace', name: '实验工作目录检查', visibility: 'public', ruleType: 'workspace-accessible', target: '.', expected: '/home/cloudlab/workspace', weight: 10, required: true },
    { id: 'file', name: 'notes.txt 文件检查', visibility: 'public', ruleType: 'file-exists', target: 'notes.txt', expected: '文件存在', weight: 40, required: true },
    { id: 'permission', name: '文件权限检查', visibility: 'hidden', ruleType: 'file-mode', target: 'notes.txt', expected: '600', weight: 50, required: true },
  ];
}

function safeTarget(value) {
  const target = String(value || '.').trim();
  if (!/^[A-Za-z0-9._/-]{1,160}$/.test(target) || target.startsWith('/') || target.split('/').includes('..')) throw new Error('评测目标路径不安全');
  return target;
}

function comparableText(value, whitespacePolicy = 'exact', caseSensitive = true) {
  let text = String(value ?? '').replace(/\r\n?/g, '\n');
  if (whitespacePolicy === 'trim-lines') {
    const lines = text.split('\n').map(line => line.trim());
    while (lines[0] === '') lines.shift();
    while (lines.at(-1) === '') lines.pop();
    text = lines.join('\n');
  } else if (whitespacePolicy === 'ignore-all') {
    text = text.replace(/\s+/gu, '');
  }
  return caseSensitive === false ? text.toLocaleLowerCase() : text;
}

async function evaluateConfiguredTests(executor, lab = {}, formal = false) {
  const evaluation = lab.evaluationConfig && typeof lab.evaluationConfig === 'object' ? lab.evaluationConfig : {};
  const configured = Array.isArray(evaluation.tests) && evaluation.tests.length ? evaluation.tests : defaultTests();
  const selected = configured.filter((test) => formal || test.visibility !== 'hidden');
  const timeoutLimit = lab.runtimeProfile === 'hadoop-spark' ? 300 : 120;
  const timeout = clampNumber(lab.maxExecutionSeconds, 1, timeoutLimit, 8) * 1000;
  const checks = [];
  const whitespacePolicy = ['exact', 'trim-lines', 'ignore-all'].includes(evaluation.whitespacePolicy) ? evaluation.whitespacePolicy : 'exact';
  const caseSensitive = evaluation.caseSensitive !== false;
  const programResults = new Map();
  for (const [index, raw] of selected.entries()) {
    const test = {
      id: String(raw.id || `test-${index + 1}`),
      name: String(raw.name || `测试 ${index + 1}`),
      visibility: raw.visibility === 'hidden' ? 'hidden' : 'public',
      ruleType: String(raw.ruleType || 'file-exists'),
      target: safeTarget(raw.target),
      expected: String(raw.expected ?? ''),
      weight: Math.max(0, Math.min(100, Number(raw.weight) || 0)),
      required: raw.required !== false,
    };
    let result;
    let actual = '';
    let passed = false;
    if (test.ruleType === 'workspace-accessible') {
      result = await executor('pwd', timeout);
      actual = result.stdout.trim() || '工作目录不可访问';
      passed = result.code === 0 && actual.endsWith('/workspace');
    } else if (test.ruleType === 'file-exists') {
      result = await executor(`if [ -f '${test.target}' ]; then printf 'exists'; else printf 'missing'; fi`, timeout);
      actual = result.stdout.trim() === 'exists' ? `${test.target} 已创建` : `尚未创建 ${test.target}`;
      passed = result.stdout.trim() === 'exists';
    } else if (test.ruleType === 'file-mode') {
      result = await executor(`stat -c %a -- '${test.target}' 2>/dev/null || true`, timeout);
      actual = result.stdout.trim() || '文件不存在';
      passed = actual === test.expected;
    } else if (test.ruleType === 'file-content-equals' || test.ruleType === 'file-content-contains') {
      result = await executor(`if [ -f '${test.target}' ]; then base64 -w0 -- '${test.target}'; fi`, timeout);
      try { actual = Buffer.from(result.stdout.trim(), 'base64').toString('utf8'); } catch { actual = ''; }
      const normalizedActual = comparableText(actual, whitespacePolicy, caseSensitive);
      const normalizedExpected = comparableText(test.expected, whitespacePolicy, caseSensitive);
      passed = test.ruleType === 'file-content-equals' ? normalizedActual === normalizedExpected : normalizedActual.includes(normalizedExpected);
      if (!actual) actual = '文件不存在或内容为空';
    } else if (test.ruleType === 'program-output-equals' || test.ruleType === 'program-output-contains') {
      const platform = ['Linux', 'Python', 'Java', '数据库'].includes(lab.techPlatform) ? lab.techPlatform : 'Linux';
      let command;
      if (platform === 'Python') command = `python3 '${test.target}'`;
      else if (platform === 'Java') {
        if (!test.target.endsWith('.java')) throw new Error('Java 评测目标必须是 .java 文件');
        const directory = test.target.includes('/') ? test.target.slice(0, test.target.lastIndexOf('/')) : '.';
        const className = test.target.slice(test.target.lastIndexOf('/') + 1, -5);
        command = `javac '${test.target}' && java -cp '${directory}' '${className}'`;
      } else if (platform === '数据库') {
        const sqliteRunner = [
          'import sqlite3, sys',
          'database = sqlite3.connect(":memory:")',
          'statement = ""',
          'for character in open(sys.argv[1], encoding="utf-8").read():',
          '    statement += character',
          '    if sqlite3.complete_statement(statement):',
          '        cursor = database.execute(statement)',
          '        if cursor.description:',
          '            for row in cursor.fetchall():',
          '                print("|".join("" if value is None else str(value) for value in row))',
          '        statement = ""',
          'if any(line.strip() and not line.lstrip().startswith("--") for line in statement.splitlines()):',
          '    raise ValueError("SQL 语句未结束")',
        ].join('\n');
        command = `python3 -c '${sqliteRunner}' '${test.target}'`;
      }
      else command = `bash '${test.target}'`;
      const cacheKey = `${platform}:${test.target}`;
      result = programResults.get(cacheKey);
      if (!result) {
        result = await executor(command, timeout);
        programResults.set(cacheKey, result);
      }
      actual = result.stdout || result.stderr;
      const normalizedActual = comparableText(actual, whitespacePolicy, caseSensitive);
      const normalizedExpected = comparableText(test.expected, whitespacePolicy, caseSensitive);
      passed = result.code === 0 && (test.ruleType === 'program-output-equals' ? normalizedActual === normalizedExpected : normalizedActual.includes(normalizedExpected));
      if (!actual) actual = result.code === 0 ? '程序无输出' : `程序退出码 ${result.code}`;
    } else {
      actual = '不支持的安全评测规则';
    }
    checks.push({ ...test, passed, actual });
  }
  const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
  const passedWeight = checks.filter((check) => check.passed).reduce((sum, check) => sum + check.weight, 0);
  const scoringRule = ['weighted', 'test-count', 'all-or-nothing'].includes(evaluation.scoringRule) ? evaluation.scoringRule : 'weighted';
  const score = scoringRule === 'all-or-nothing'
    ? (checks.every((check) => check.passed) ? 100 : 0)
    : scoringRule === 'test-count'
      ? (checks.length ? Math.round((checks.filter((check) => check.passed).length / checks.length) * 100) : 0)
      : totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : (checks.every((check) => check.passed) ? 100 : 0);
  const passingScore = Math.max(1, Math.min(100, Number(evaluation.passingScore) || 100));
  const policyPassed = evaluation.passPolicy === 'score-threshold'
    ? score >= passingScore && checks.filter((check) => check.required).every((check) => check.passed)
    : checks.filter((check) => check.required).every((check) => check.passed);
  const passed = scoringRule === 'all-or-nothing' ? checks.every((check) => check.passed) : policyPassed;
  const responseChecks = checks.map((check) => check.visibility === 'hidden'
    ? { ...check, name: '隐藏测试', target: '', expected: '保密', actual: check.passed ? '通过' : '未通过' }
    : check);
  const artifacts = [];
  if (evaluation.outputType && evaluation.outputType !== '文本结果') {
    for (const rawPath of (Array.isArray(evaluation.studentFiles) ? evaluation.studentFiles : []).slice(0, 5)) {
      const path = safeTarget(rawPath);
      const artifact = await executor(`if [ -f '${path}' ]; then head -c 100000 -- '${path}' | base64 -w0; fi`, timeout);
      if (!artifact.stdout.trim()) continue;
      const extension = path.split('.').pop().toLowerCase();
      const mimeType = extension === 'svg' ? 'image/svg+xml' : extension === 'png' ? 'image/png' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : 'text/plain';
      if (evaluation.outputType === '图形效果' && !mimeType.startsWith('image/')) continue;
      artifacts.push({ path, mimeType, contentBase64: artifact.stdout.trim() });
    }
  }
  return { passed, score, passingScore, passPolicy: evaluation.passPolicy || 'all-required', scoringRule, whitespacePolicy, caseSensitive, formal, checks: responseChecks, outputType: evaluation.outputType || '文本结果', artifacts };
}

async function runLabTests(req, lab = {}) {
  const session = sessionForRequest(req);
  if (!session) return null;
  armIdleTimer(session);
  const formal = String(req.headers['x-lab-formal'] || '') === 'true';
  return evaluateConfiguredTests((script, timeout) => dockerExec(session.containerId, script, timeout), lab, formal);
}

async function resetWorkspace(req) {
  const session = sessionForRequest(req);
  if (!session) return null;
  armIdleTimer(session);
  const result = await dockerExec(session.containerId, `find . -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && printf '实验工作目录已重置\\n'`);
  if (result.code === 0) await initializeWorkspace(session);
  return { reset: result.code === 0, output: result.stdout || result.stderr };
}

function status() {
  return {
    enabled,
    activeSessions: sessions.size,
    maxSessions,
    maxSessionsPerIp,
    perIpLimitEnabled: maxSessionsPerIp > 0,
    image: terminalImage,
    isolation: enabled ? 'Docker · 无网络 · 只读根文件系统' : '未启用',
    capabilities: { platforms: ['Linux', 'Python', 'Java', '数据库'], tools: ['bash', 'node', 'npm', 'python3', 'javac', 'java', 'sqlite3'], fileEditor: true, webDesktop: false },
    limits: { memoryMiB: 384, cpu: 0.25, processes: 64, idleMinutes: idleTimeoutMs / 60_000, maxMinutes: maxLifetimeMs / 60_000 },
  };
}

function attach(server) {
  server.on('upgrade', handleUpgrade);
}

module.exports = { attach, configureCapacity, issueToken, runLabTests, resetWorkspace, listFiles, readFile, writeFile, status, terminalAvailable, containerConfig, evaluateConfiguredTests, modeAllowsOwnerWrite };
