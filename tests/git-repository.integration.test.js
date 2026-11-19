const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('实验代码保存到真实 Git 仓库并支持历史、差异与回滚', async (t) => {
  const temp = fs.mkdtempSync(path.join(root, 'tmp-git-test-'));
  process.env.CLOUDLAB_DATA_FILE = path.join(temp, 'platform.json');
  process.env.CLOUDLAB_GIT_ROOT = path.join(temp, 'repositories');
  process.env.CLOUDLAB_GIT_PROVIDER = 'local';
  process.env.CLOUDLAB_GIT_TEMP_ROOT = path.join(temp, 'worktrees');
  const repositories = require('../git-repository-service');
  t.after(() => fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const baseLab = {
    id: 'lab-real-git',
    name: '真实 Git 实验',
    initialFiles: [{ path: 'src/main.py', content: 'print("v1")\n', readOnly: false }, { path: 'README.md', content: '# v1\n', readOnly: true }],
    repository: { branch: 'main', commitMessage: '初始化项目', files: [{ path: 'src/main.py', content: 'print("v1")\n' }, { path: 'README.md', content: '# v1\n', readOnly: true }] },
    checkpoints: [{ id: 'cp-1', name: '第一关' }],
  };
  const first = await repositories.persistLabRepository(baseLab, { username: 'teacher', name: '教师' });
  assert.equal(first.repository.storage, 'git');
  assert.equal(first.repository.provider, 'local');
  assert.match(first.repository.headCommit, /^[a-f0-9]{40}$/);
  assert.equal('files' in first.repository, false);
  assert.equal('initialFiles' in first, false);
  assert.equal(first.checkpoints[0].repositoryRef.commitSha, first.repository.headCommit);
  assert.equal(fs.existsSync(first.repository.repoPath), true);

  let hydrated = await repositories.hydrateLabRepository(first);
  assert.equal(hydrated.repository.files.find(file => file.path === 'src/main.py').content, 'print("v1")\n');
  const firstCommit = first.repository.headCommit;
  hydrated.repository.files.find(file => file.path === 'src/main.py').content = 'print("v2")\n';
  hydrated.repository.commitMessage = '升级到 v2';
  const second = await repositories.persistLabRepository(hydrated, { username: 'teacher', name: '教师' });
  assert.notEqual(second.repository.headCommit, firstCommit);
  const history = await repositories.repositoryHistory(second.repository);
  assert.equal(history.length, 2);
  assert.equal(history[0].message, '升级到 v2');
  const diff = await repositories.repositoryDiff(second.repository, firstCommit, second.repository.headCommit);
  assert.match(diff, /print\(\"v2\"\)/);

  const restored = await repositories.restoreRepository(second.repository, firstCommit, { username: 'teacher', name: '教师' });
  const snapshot = await repositories.repositorySnapshot({ ...second.repository, headCommit: restored.headCommit });
  assert.equal(snapshot.files.find(file => file.path === 'src/main.py').content, 'print("v1")\n');
  assert.equal((await repositories.repositoryHistory({ ...second.repository, headCommit: restored.headCommit })).length, 3);
});

test('旧 JSON 文件正文可一次性迁移并保留可恢复备份', () => {
  const temp = fs.mkdtempSync(path.join(root, 'tmp-git-migration-'));
  try {
    const dataFile = path.join(temp, 'platform.json');
    fs.writeFileSync(dataFile, JSON.stringify({ version: 2, revision: 0, courses: [], settings: {}, studentProgress: {}, labs: [{ id: 'legacy-lab', name: '旧实验', initialFiles: [{ path: 'main.py', content: 'print("legacy")\n' }], checkpoints: [{ id: 'cp-legacy', name: '第一关' }] }] }, null, 2));
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'migrate-json-repositories.js')], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CLOUDLAB_DATA_FILE: dataFile, CLOUDLAB_GIT_PROVIDER: 'local', CLOUDLAB_GIT_ROOT: path.join(temp, 'repositories'), CLOUDLAB_GIT_TEMP_ROOT: path.join(temp, 'worktrees') },
    });
    assert.equal(result.status, 0, result.stderr);
    const migrated = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    assert.equal(migrated.labs[0].repository.storage, 'git');
    assert.match(migrated.labs[0].repository.headCommit, /^[a-f0-9]{40}$/);
    assert.equal('initialFiles' in migrated.labs[0], false);
    assert.equal(JSON.stringify(migrated).includes('print("legacy")'), false);
    assert.equal(fs.readdirSync(temp).some(name => name.includes('.pre-git-') && name.endsWith('.bak')), true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
