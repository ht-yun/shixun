const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const target = path.resolve(process.argv[2] || 'cloudlab-auth.json');
let password = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { password += chunk; });
process.stdin.on('end', () => {
  password = password.replace(/[\r\n]+$/, '');
  if (password.length < 8) {
    console.error('Password must contain at least 8 characters.');
    process.exit(2);
  }
  const auth = JSON.parse(fs.readFileSync(target, 'utf8'));
  const accounts = Array.isArray(auth.accounts) ? auth.accounts : [];
  const existingAdmin = accounts.find(account => account.username === 'admin');
  const account = accounts.find(item => item.username === 'cloudlab-admin' || item.role === 'admin');
  if (!account) {
    console.error('Administrator account was not found.');
    process.exit(3);
  }
  if (existingAdmin && existingAdmin.id !== account.id) {
    console.error('Username admin already belongs to another account.');
    process.exit(4);
  }
  const salt = crypto.randomBytes(16).toString('hex');
  Object.assign(account, {
    username: 'admin',
    name: 'admin',
    role: 'admin',
    salt,
    passwordHash: crypto.scryptSync(password, salt, 64).toString('hex'),
    enabled: true,
    updatedAt: new Date().toISOString(),
  });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(auth, null, 2), 'utf8');
  fs.renameSync(temporary, target);
  console.log('ADMIN_ACCOUNT_UPDATED');
});
