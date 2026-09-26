import crypto from 'node:crypto';
import readline from 'node:readline';

const username = process.argv[2];
const workspace = process.argv[3] || username;
if (!username || !/^[a-z0-9_-]{2,64}$/i.test(username) || !/^[a-z0-9_-]{2,64}$/i.test(workspace)) {
  console.error('Usage: node scripts/create-tester-account.mjs USERNAME [WORKSPACE]');
  process.exitCode = 1;
} else {
  const terminal = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  process.stderr.write('Password (input hidden): ');
  process.stdin.setRawMode?.(true);
  let password = '';
  process.stdin.on('data', (chunk) => {
    for (const byte of chunk) {
      if (byte === 3) { terminal.close(); process.exit(130); }
      if (byte === 13 || byte === 10) {
        process.stdin.setRawMode?.(false);
        terminal.close();
        process.stderr.write('\n');
        if (password.length < 12) {
          console.error('Choose a password of at least 12 characters.');
          process.exitCode = 1;
          return;
        }
        const salt = crypto.randomBytes(16).toString('hex');
        console.log(JSON.stringify({ username, workspace, passwordHash: `${salt}:${crypto.scryptSync(password, salt, 32).toString('hex')}` }));
        password = '';
        return;
      }
      if (byte === 127 || byte === 8) password = password.slice(0, -1);
      else password += String.fromCharCode(byte);
    }
  });
}
