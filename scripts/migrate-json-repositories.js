/* 将旧版 platform.json 中的文件正文迁移到真实 Git 仓库。 */
const fs = require('fs');
const path = require('path');
const repositories = require('../git-repository-service');

const dataFile = path.resolve(process.env.CLOUDLAB_DATA_FILE || path.join(__dirname, '..', 'local-data.json'));

async function main() {
  if (!fs.existsSync(dataFile)) throw new Error(`平台数据文件不存在：${dataFile}`);
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  if (!Array.isArray(data.labs)) throw new Error('平台数据中的 labs 格式不正确');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${dataFile}.pre-git-${timestamp}.bak`;
  fs.copyFileSync(dataFile, backup, fs.constants.COPYFILE_EXCL);
  const migrated = [];
  for (const lab of data.labs) {
    if (lab.repository?.storage === 'git' && !Array.isArray(lab.repository?.files) && !Array.isArray(lab.initialFiles)) {
      migrated.push(lab);
      continue;
    }
    migrated.push(await repositories.persistLabRepository(lab, { id: 'migration', username: 'migration', name: 'CloudLab 数据迁移' }));
  }
  const temporary = `${dataFile}.${process.pid}.git-migration.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ ...data, labs: migrated }, null, 2), 'utf8');
  fs.renameSync(temporary, dataFile);
  process.stdout.write(`Git 仓库迁移完成：${migrated.length} 个实验\n备份文件：${backup}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message || error}\n`); process.exitCode = 1; });
