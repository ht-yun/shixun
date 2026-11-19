const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');

const base = process.env.CLOUDLAB_TERMINAL_LIVE_URL;

function waitFor(socket, predicate, timeout = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('等待终端输出超时'));
    }, timeout);
    const onMessage = (raw) => {
      let message;
      try { message = JSON.parse(raw.toString('utf8')); } catch { return; }
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    };
    const onError = (error) => { cleanup(); reject(error); };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('message', onMessage);
      socket.off('error', onError);
    };
    socket.on('message', onMessage);
    socket.on('error', onError);
  });
}

test('真实 Docker 终端可连接、执行命令并参与评测', { skip: !base }, async (t) => {
  let response = await fetch(`${base}/api/terminal/status`);
  const status = await response.json();
  assert.equal(response.status, 200);
  assert.equal(status.enabled, true);

  response = await fetch(`${base}/api/terminal/session`, { method: 'POST' });
  const ticket = await response.json();
  assert.equal(response.status, 201, JSON.stringify(ticket));
  const websocketBase = base.replace(/^http/, 'ws');
  const socket = new WebSocket(`${websocketBase}${ticket.websocketPath}?token=${encodeURIComponent(ticket.token)}`);
  t.after(() => socket.close());
  const ready = await waitFor(socket, (message) => message.type === 'ready');
  assert.match(ready.sessionId, /^[0-9a-f-]{36}$/);

  let output = '';
  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString('utf8'));
      if (message.type === 'output') output += message.data;
    } catch {}
  });
  socket.send(JSON.stringify({ type: 'resize', cols: 100, rows: 30 }));
  socket.send(JSON.stringify({ type: 'input', data: 'pwd\rid\rtouch notes.txt\rchmod 600 notes.txt\rstat -c "%a %n" notes.txt\r' }));
  for (let attempt = 0; attempt < 100 && !/600 notes\.txt/.test(output); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.match(output, /\/home\/cloudlab\/workspace/);
  assert.match(output, /uid=10001\(cloudlab\)/);
  assert.match(output, /600 notes\.txt/);

  response = await fetch(`${base}/api/lab/test`, { method: 'POST', headers: { 'X-Terminal-Session': ready.sessionId, 'X-Lab-Formal': 'true' } });
  const report = await response.json();
  assert.equal(response.status, 200);
  assert.equal(report.passed, true, JSON.stringify(report));
  const permission = report.checks.find((check) => check.id === 'permission');
  assert.equal(permission.visibility, 'hidden');
  assert.equal(permission.passed, true);
  assert.equal(permission.actual, '通过');
  socket.send(JSON.stringify({ type: 'input', data: 'exit\r' }));
});
