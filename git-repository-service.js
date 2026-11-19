/* CloudLab 真正 Git 仓库适配层：本地裸仓库用于开发，Gitea 用于生产。 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const provider = String(process.env.CLOUDLAB_GIT_PROVIDER || 'local').toLowerCase();
const defaultDataDirectory = path.dirname(path.resolve(process.env.CLOUDLAB_DATA_FILE || path.join(__dirname, 'local-data.json')));
const repositoriesRoot = path.resolve(process.env.CLOUDLAB_GIT_ROOT || path.join(defaultDataDirectory, 'repositories'));
const giteaUrl = String(process.env.CLOUDLAB_GITEA_URL || '').replace(/\/$/, '');
const giteaToken = String(process.env.CLOUDLAB_GITEA_TOKEN || '');
const giteaOwner = String(process.env.CLOUDLAB_GITEA_OWNER || 'cloudlab');
const maxFiles = Math.max(1, Number(process.env.CLOUDLAB_GIT_MAX_FILES || 200));
const maxFileBytes = Math.max(1024, Number(process.env.CLOUDLAB_GIT_MAX_FILE_BYTES || 1_000_000));
const temporaryRootBase = path.resolve(process.env.CLOUDLAB_GIT_TEMP_ROOT || os.tmpdir());
const repositoryLocks = new Map();
const snapshotCache = new Map();
const historyCache = new Map();

function safePath(value) {
  const target = String(value || '').trim().replace(/\\/g, '/');
  if (!/^[A-Za-z0-9._/-]{1,240}$/.test(target) || target.startsWith('/') || target.split('/').includes('..') || target.endsWith('/')) throw new Error(`仓库文件路径不安全：${target}`);
  return target;
}

function safeName(value) {
  const name = String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return name || `lab-${Date.now()}`;
}

function normalizedFiles(files = []) {
  if (!Array.isArray(files) || !files.length) throw new Error('Git 仓库至少需要一个文件');
  if (files.length > maxFiles) throw new Error(`Git 仓库最多允许 ${maxFiles} 个文件`);
  const result = files.map((file) => {
    const content = String(file.content ?? '');
    if (Buffer.byteLength(content, 'utf8') > maxFileBytes) throw new Error(`仓库文件超过大小限制：${file.path || file.name}`);
    return { path: safePath(file.path || file.name), content, readOnly: file.readOnly === true };
  });
  if (new Set(result.map(file => file.path)).size !== result.length) throw new Error('Git 仓库文件路径不能重复');
  return result;
}

function filesDigest(files) {
  const canonical = normalizedFiles(files).slice().sort((a, b) => a.path.localeCompare(b.path)).map(file => [file.path, file.content, file.readOnly]);
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function gitEnvironment(repository = {}) {
  const environment = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  if ((repository.provider || provider) === 'gitea' && giteaToken) {
    environment.GIT_CONFIG_COUNT = '1';
    environment.GIT_CONFIG_KEY_0 = 'http.extraHeader';
    environment.GIT_CONFIG_VALUE_0 = `Authorization: token ${giteaToken}`;
  }
  return environment;
}

function runGit(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: options.cwd, env: options.env || process.env, windowsHide: true });
    let stdout = ''; let stderr = ''; let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true; child.kill(); reject(new Error('Git 操作超时'));
    }, options.timeout || 30_000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.on('close', code => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      const result = { code: Number(code ?? -1), stdout, stderr };
      if (result.code !== 0 && !options.allowFailure) return reject(new Error((stderr || stdout || `git ${args[0]} 执行失败`).trim()));
      resolve(result);
    });
  });
}

async function giteaRequest(endpoint, options = {}) {
  if (!giteaUrl || !giteaToken) throw new Error('Gitea 未配置 CLOUDLAB_GITEA_URL 或 CLOUDLAB_GITEA_TOKEN');
  const response = await fetch(`${giteaUrl}/api/v1${endpoint}`, {
    ...options,
    headers: { Authorization: `token ${giteaToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) throw new Error(body.message || `Gitea API 请求失败：HTTP ${response.status}`);
  return body;
}

async function createRepositoryRecord(lab) {
  const repositoryName = safeName(`${lab.id || 'lab'}-${lab.name || 'project'}`);
  if (provider === 'gitea') {
    let created;
    try {
      created = await giteaRequest(`/orgs/${encodeURIComponent(giteaOwner)}/repos`, { method: 'POST', body: JSON.stringify({ name: repositoryName, private: true, auto_init: false, default_branch: 'main', description: `CloudLab 实践项目：${lab.name || repositoryName}` }) });
    } catch (error) {
      if (!/404|organization|组织/i.test(error.message)) throw error;
      created = await giteaRequest('/user/repos', { method: 'POST', body: JSON.stringify({ name: repositoryName, private: true, auto_init: false, default_branch: 'main', description: `CloudLab 实践项目：${lab.name || repositoryName}` }) });
    }
    return { storage: 'git', provider: 'gitea', repositoryId: created.id, owner: created.owner?.login || giteaOwner, name: created.name, cloneUrl: created.clone_url, webUrl: created.html_url, defaultBranch: created.default_branch || 'main' };
  }
  fs.mkdirSync(repositoriesRoot, { recursive: true });
  const repoPath = path.join(repositoriesRoot, `${safeName(lab.id || repositoryName)}.git`);
  if (!fs.existsSync(repoPath)) await runGit(['init', '--bare', '--initial-branch=main', repoPath]);
  return { storage: 'git', provider: 'local', repositoryId: lab.id || repositoryName, owner: 'cloudlab-local', name: repositoryName, repoPath, cloneUrl: repoPath, webUrl: '', defaultBranch: 'main' };
}

function remoteFor(repository) {
  const remote = repository.provider === 'local' ? repository.repoPath : repository.cloneUrl;
  if (!remote) throw new Error('Git 仓库缺少克隆地址');
  return remote;
}

async function withClone(repository, operation) {
  fs.mkdirSync(temporaryRootBase, { recursive: true });
  const temporaryRoot = fs.mkdtempSync(path.join(temporaryRootBase, 'cloudlab-git-'));
  const workdir = path.join(temporaryRoot, 'worktree');
  try {
    await runGit(['clone', '--no-tags', remoteFor(repository), workdir], { env: gitEnvironment(repository), timeout: 60_000 });
    return await operation(workdir);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

function repositoryKey(repository = {}) {
  return String(repository.repositoryId || repository.repoPath || repository.cloneUrl || repository.name || 'unknown');
}

function revisionKey(repository = {}, ref = '') {
  return `${repositoryKey(repository)}:${ref || repository.headCommit || repository.defaultBranch || 'main'}`;
}

function withRepositoryLock(repository, operation) {
  const key = repositoryKey(repository);
  const previous = repositoryLocks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  const tracked = current.finally(() => { if (repositoryLocks.get(key) === tracked) repositoryLocks.delete(key); });
  repositoryLocks.set(key, tracked);
  return tracked;
}

async function commitSnapshotUnlocked(repository, files, message, actor = {}) {
  const safeFiles = normalizedFiles(files);
  const branch = String(repository.defaultBranch || 'main');
  return withClone(repository, async (workdir) => {
    await runGit(['config', 'user.name', String(actor.name || 'CloudLab 教师').slice(0, 100)], { cwd: workdir });
    await runGit(['config', 'user.email', `${safeName(actor.username || actor.id || 'teacher')}@cloudlab.local`], { cwd: workdir });
    for (const entry of fs.readdirSync(workdir, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      fs.rmSync(path.join(workdir, entry.name), { recursive: true, force: true });
    }
    for (const file of safeFiles) {
      const destination = path.join(workdir, ...file.path.split('/'));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, file.content, 'utf8');
    }
    await runGit(['add', '--all'], { cwd: workdir });
    const changed = await runGit(['diff', '--cached', '--quiet'], { cwd: workdir, allowFailure: true });
    if (changed.code !== 0) await runGit(['commit', '-m', String(message || '更新实践项目代码').slice(0, 300)], { cwd: workdir });
    const head = await runGit(['rev-parse', 'HEAD'], { cwd: workdir });
    await runGit(['push', 'origin', `HEAD:${branch}`], { cwd: workdir, env: gitEnvironment(repository), timeout: 60_000 });
    return head.stdout.trim();
  });
}

function commitSnapshot(repository, files, message, actor = {}) {
  const safeFiles = normalizedFiles(files);
  return withRepositoryLock(repository, async () => {
    const headCommit = await commitSnapshotUnlocked(repository, safeFiles, message, actor);
    snapshotCache.set(revisionKey(repository, headCommit), { commitSha: headCommit, files: structuredClone(safeFiles) });
    historyCache.delete(revisionKey(repository, headCommit));
    return headCommit;
  });
}

async function repositoryHistory(repository, limit = 30) {
  const cacheKey = revisionKey(repository);
  const cached = historyCache.get(cacheKey);
  if (cached && cached.length >= Math.min(Number(limit) || 30, 30)) return structuredClone(cached.slice(0, limit));
  return withClone(repository, async (workdir) => {
    const ref = repository.headCommit || repository.defaultBranch || 'main';
    const result = await runGit(['log', ref, `--max-count=${Math.max(1, Math.min(100, Number(limit) || 30))}`, '--date=iso-strict', '--pretty=format:%H%x1f%an%x1f%ad%x1f%s'], { cwd: workdir, allowFailure: true });
    if (result.code !== 0) return [];
    const history = result.stdout.split(/\r?\n/).filter(Boolean).map(line => {
      const [id, author, at, message] = line.split('\x1f');
      return { id, shortId: id.slice(0, 8), author, at, message };
    });
    historyCache.set(cacheKey, structuredClone(history));
    return history;
  });
}

async function repositorySnapshot(repository, ref = '') {
  const cacheKey = revisionKey(repository, ref);
  if (snapshotCache.has(cacheKey)) return structuredClone(snapshotCache.get(cacheKey));
  return withClone(repository, async (workdir) => {
    const commit = ref || repository.headCommit || repository.defaultBranch || 'main';
    const tree = await runGit(['ls-tree', '-r', '--name-only', commit], { cwd: workdir });
    const paths = tree.stdout.split(/\r?\n/).filter(Boolean).slice(0, maxFiles);
    const readOnly = new Set(Array.isArray(repository.readOnlyPaths) ? repository.readOnlyPaths : []);
    const files = [];
    for (const filePath of paths) {
      const safe = safePath(filePath);
      const content = await runGit(['show', `${commit}:${safe}`], { cwd: workdir });
      if (Buffer.byteLength(content.stdout, 'utf8') > maxFileBytes) throw new Error(`Git 文件超过读取限制：${safe}`);
      files.push({ path: safe, content: content.stdout, readOnly: readOnly.has(safe) });
    }
    const resolved = await runGit(['rev-parse', commit], { cwd: workdir });
    const snapshot = { commitSha: resolved.stdout.trim(), files };
    snapshotCache.set(cacheKey, structuredClone(snapshot));
    snapshotCache.set(revisionKey(repository, snapshot.commitSha), structuredClone(snapshot));
    return snapshot;
  });
}

async function repositoryDiff(repository, fromRef, toRef = '') {
  return withClone(repository, async (workdir) => {
    const from = String(fromRef || '').trim();
    const to = String(toRef || repository.headCommit || repository.defaultBranch || 'main').trim();
    if (!/^[A-Fa-f0-9]{7,64}$/.test(from) || !/^[A-Fa-f0-9]{7,64}$/.test(to)) throw new Error('Git 版本标识不正确');
    const result = await runGit(['diff', '--no-ext-diff', '--unified=3', from, to], { cwd: workdir });
    return result.stdout.slice(0, 200_000);
  });
}

async function restoreRepository(repository, commitSha, actor = {}) {
  const snapshot = await repositorySnapshot(repository, commitSha);
  const headCommit = await commitSnapshot(repository, snapshot.files, `回滚到版本 ${snapshot.commitSha.slice(0, 8)}`, actor);
  return { headCommit, files: snapshot.files };
}

async function persistLabRepository(lab, actor = {}) {
  const incoming = lab.repository && typeof lab.repository === 'object' ? lab.repository : {};
  const files = Array.isArray(incoming.files) && incoming.files.length ? incoming.files : lab.initialFiles;
  if ((!Array.isArray(files) || !files.length) && incoming.storage === 'git') return lab;
  if (!Array.isArray(files) || !files.length) return lab;
  const safeFiles = normalizedFiles(files);
  const contentDigest = filesDigest(safeFiles);
  if (incoming.storage === 'git' && incoming.headCommit && incoming.contentDigest === contentDigest) {
    const repository = { ...incoming, filePaths: safeFiles.map(file => file.path), readOnlyPaths: safeFiles.filter(file => file.readOnly).map(file => file.path) };
    delete repository.files;
    delete repository.commits;
    const checkpoints = (Array.isArray(lab.checkpoints) ? lab.checkpoints : []).map(checkpoint => ({ ...checkpoint, repositoryRef: checkpoint.repositoryRef?.commitSha ? checkpoint.repositoryRef : { branch: repository.defaultBranch || 'main', commitSha: repository.headCommit } }));
    const unchanged = { ...lab, repository, checkpoints };
    delete unchanged.initialFiles;
    return unchanged;
  }
  const repository = incoming.storage === 'git' ? { ...incoming } : await createRepositoryRecord(lab);
  const headCommit = await commitSnapshot(repository, safeFiles, incoming.commitMessage || '初始化实践项目代码仓库', actor);
  const history = await repositoryHistory({ ...repository, headCommit }, 30);
  snapshotCache.set(revisionKey(repository, headCommit), { commitSha: headCommit, files: structuredClone(safeFiles) });
  historyCache.set(revisionKey(repository, headCommit), structuredClone(history));
  const persistedRepository = {
    ...repository,
    headCommit,
    defaultBranch: incoming.branch || repository.defaultBranch || 'main',
    commitMessage: history[0]?.message || incoming.commitMessage || '更新实践项目代码',
    revision: history.length,
    contentDigest,
    filePaths: safeFiles.map(file => file.path),
    readOnlyPaths: safeFiles.filter(file => file.readOnly).map(file => file.path),
  };
  delete persistedRepository.files;
  delete persistedRepository.commits;
  const checkpoints = (Array.isArray(lab.checkpoints) ? lab.checkpoints : []).map(checkpoint => ({ ...checkpoint, repositoryRef: { branch: persistedRepository.defaultBranch, commitSha: headCommit } }));
  const result = { ...lab, repository: persistedRepository, checkpoints };
  delete result.initialFiles;
  return result;
}

async function hydrateLabRepository(lab, ref = '') {
  if (lab.repository?.storage !== 'git') return lab;
  const snapshot = await repositorySnapshot(lab.repository, ref);
  const commits = await repositoryHistory({ ...lab.repository, headCommit: snapshot.commitSha }, 30);
  return { ...lab, initialFiles: snapshot.files, repository: { ...lab.repository, headCommit: snapshot.commitSha, files: snapshot.files, commits, revision: commits.length, commitMessage: commits[0]?.message || lab.repository.commitMessage } };
}

function status() {
  return { provider, repositoriesRoot, giteaConfigured: Boolean(giteaUrl && giteaToken), giteaUrl, owner: giteaOwner, maxFiles, maxFileBytes };
}

module.exports = { status, safePath, normalizedFiles, persistLabRepository, hydrateLabRepository, repositorySnapshot, repositoryHistory, repositoryDiff, restoreRepository, commitSnapshot };
