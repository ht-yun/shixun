const base = process.env.CLOUDLAB_BASE_URL;
const username = process.env.CLOUDLAB_VERIFY_USER;
const password = process.env.CLOUDLAB_VERIFY_PASSWORD;

async function main() {
  const health = await fetch(`${base}/api/health`);
  if (!health.ok) throw new Error(`health ${health.status}`);
  const html = await (await fetch(`${base}/index.html`)).text();
  const app = await (await fetch(`${base}/app.js?v=20261110-3`)).text();
  if (/网页桌面|desktopHost/.test(html) || /connectDesktop|api\/desktop|novnc/.test(app)) throw new Error('desktop UI code is still publicly served');

  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!login.ok) throw new Error(`login ${login.status}`);
  const cookie = String(login.headers.get('set-cookie') || '').split(';')[0];
  const bootstrap = await fetch(`${base}/api/bootstrap?runtime=1`, { headers: { Cookie: cookie } });
  const data = await bootstrap.json();
  if (!bootstrap.ok) throw new Error(`bootstrap ${bootstrap.status}`);
  if ((data.labs || []).some((lab) => lab.mode === '网页桌面')) throw new Error('legacy desktop lab mode remains');
  const desktop = await fetch(`${base}/api/desktop/status`, { headers: { Cookie: cookie } });
  if (desktop.status !== 404) throw new Error(`desktop API status ${desktop.status}`);
  const terminal = await fetch(`${base}/api/terminal/status`, { headers: { Cookie: cookie } });
  if (!terminal.ok) throw new Error(`terminal status ${terminal.status}`);
  console.log(JSON.stringify({ ok: true, health: await health.json(), labs: (data.labs || []).length, desktopApi: desktop.status, terminal: await terminal.json() }));
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
