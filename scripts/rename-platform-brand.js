/* 仅迁移平台数据中的对外品牌文案；保留 cloudlab 用户、路径、环境变量等运行标识。 */
const fs = require('node:fs');
const path = require('node:path');

const dataFile = path.resolve(process.argv[2] || path.join(__dirname, '..', 'local-data.json'));
const replacements = [
  [/云实训\s*CloudLab/g, '学生实践平台'],
  [/CloudLab\s*演示学院/g, '学生实践平台演示学院'],
  [/在\s*CloudLab\s*中/g, '在学生实践平台中'],
  [/进入\s*CloudLab\s*真实实验环境/g, '进入学生实践平台真实实验环境'],
];

function migrate(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => migrate(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, migrate(childValue, childKey)]));
  }
  if (typeof value !== 'string') return value;
  if (key === 'institution' && value.trim() === 'CloudLab') return '学生实践平台';
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

const original = fs.readFileSync(dataFile, 'utf8');
const parsed = JSON.parse(original);
const migrated = `${JSON.stringify(migrate(parsed), null, 2)}\n`;

if (migrated === original) {
  console.log('BRAND_DATA_UNCHANGED');
  process.exit(0);
}

const backup = `${dataFile}.brand-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const temporary = `${dataFile}.brand-migration.tmp`;
fs.copyFileSync(dataFile, backup);
fs.writeFileSync(temporary, migrated, 'utf8');
fs.renameSync(temporary, dataFile);
console.log(`BRAND_DATA_UPDATED ${backup}`);
