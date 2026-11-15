// quests: what the check scripts (api.cjs, headless.cjs, history-peek.cjs) need about one server, on any platform:
// its environment from quests/lib/quests_env.py (QUESTS_INSTANCE, else the server of the current folder), its URL,
// a 10-minute login token signed with the server's own secret, and a Chrome to drive.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const env = Object.fromEntries(
  execFileSync('python3', ['-I', path.join(__dirname, '..', 'lib', 'quests_env.py'), '--shell'], { encoding: 'utf8' })
    .split('\n').map((l) => l.match(/^export ([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^'(.*)'$/, '$1')]),
);

const db = new Database(env.DATABASE_PATH, { readonly: true });
const secret = db.prepare("select value from app_config where key like '%jwt%'").get().value;
const user = db.prepare('select id, username from users order by id limit 1').get();
db.close();

const CHROMES = {
  win32: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  linux: ['/opt/google/chrome/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'],
};

module.exports = {
  env,
  base: `http://127.0.0.1:${env.SERVER_PORT}`,
  token: jwt.sign({ userId: user.id, username: user.username }, secret, { expiresIn: 600 }),
  databasePath: env.DATABASE_PATH,
  chrome: process.env.CHROME || (CHROMES[process.platform] ?? []).find((p) => fs.existsSync(p)),
};
