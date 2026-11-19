const fs = require('fs');
const path = require('path');

const target = path.resolve(process.argv[2] || path.join(__dirname, '..', 'local-data.json'));
const data = JSON.parse(fs.readFileSync(target, 'utf8'));
let changed = 0;
data.labs = (Array.isArray(data.labs) ? data.labs : []).map((lab) => {
  if (lab.mode !== '网页桌面') return lab;
  changed += 1;
  return { ...lab, mode: '代码 + 命令行' };
});
if (changed) {
  const backup = `${target}.before-remove-desktop-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`;
  fs.copyFileSync(target, backup);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temporary, target);
  console.log(JSON.stringify({ target, changed, backup }));
} else {
  console.log(JSON.stringify({ target, changed, backup: '' }));
}
