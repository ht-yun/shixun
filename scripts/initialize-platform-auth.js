const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [targetArg, usernameArg, nameArg, roleArg = 'admin'] = process.argv.slice(2);
if (!targetArg || !/^[A-Za-z0-9._-]{3,80}$/.test(usernameArg || '') || !nameArg || !['admin', 'teacher', 'student'].includes(roleArg)) {
  console.error('Usage: node initialize-platform-auth.js <auth-file> <username> <name> [admin|teacher|student]');
  process.exit(2);
}

let password = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { password += chunk; });
process.stdin.on('end', () => {
  password = password.replace(/[\r\n]+$/, '');
  if (password.length < 12) {
    console.error('Password must contain at least 12 characters.');
    process.exit(3);
  }
  const target = path.resolve(targetArg);
  let auth = { accounts: [], sessionSecret: crypto.randomBytes(48).toString('base64url') };
  try { auth = { ...auth, ...JSON.parse(fs.readFileSync(target, 'utf8')) }; } catch {}
  auth.accounts = Array.isArray(auth.accounts) ? auth.accounts : [];
  if (auth.accounts.some(account => account.username === usernameArg)) {
    console.error('Account already exists.');
    process.exit(4);
  }
  const salt = crypto.randomBytes(16).toString('hex');
  auth.accounts.push({
    id: crypto.randomUUID(),
    username: usernameArg,
    name: nameArg,
    role: roleArg,
    salt,
    passwordHash: crypto.scryptSync(password, salt, 64).toString('hex'),
    enabled: true,
    createdAt: new Date().toISOString(),
  });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(auth, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, target);
  console.log('AUTH_ACCOUNT_CREATED');
});
