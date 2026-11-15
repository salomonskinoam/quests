#!/usr/bin/env node
// quests: after every server build, copies dist-server into its own folder,
// ~/.local/share/<unit prefix>/builds/<time>-<commit>/, and points builds/current at it, once for every quests server
// that runs from this checkout (QUESTS_CHECKOUT in ~/.config/quests/<instance>.env, quests/INTERFACE.md). A new chat
// service starts from current; a running one keeps the folder it started from, so a build never changes code under a
// running chat. Every other top-level entry of the repo (node_modules, package.json, public, ...) is a symlink,
// because the server finds its app root as the parent of dist-server. Old builds no open chat service uses are removed.
// Windows without admin rights cannot make symlinks: there a folder is a junction, a file a copy, and there is no
// builds/current (the manager starts the newest build by name, server/modules/chat-hosts/hosts.ts).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
// Windows paths are case-blind (c:\src and C:\src are one folder).
const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const config = path.join(os.homedir(), '.config', 'quests');
const read = (f) => Object.fromEntries(fs.readFileSync(f, 'utf8').split('\n').map((l) => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
// The defaults of quests/lib/quests_env.py: no server file means one server, "main", run from this checkout.
const byName = (name) => ({ QUESTS_INSTANCE: name, QUESTS_CHECKOUT: repo, QUESTS_UNIT_PREFIX: name === 'main' ? 'quests' : `quests-${name}`, DATABASE_PATH: `~/.config/quests/${name}.db` });
const files = fs.existsSync(config) ? fs.readdirSync(config).filter((f) => f.endsWith('.env') && f !== 'user.env') : [];
const servers = (files.length ? files.map((f) => ({ ...byName(f.slice(0, -4)), ...read(path.join(config, f)) })) : [byName('main')])
  .filter((s) => same(fs.realpathSync(s.QUESTS_CHECKOUT), repo));
if (!servers.length) console.log(`snapshot-build: no quests server runs from ${repo}; nothing to snapshot`);
const commit = execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const id = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}-${commit}`;
const { default: Database } = await import(pathToFileURL(path.join(repo, 'node_modules', 'better-sqlite3', 'lib', 'index.js')).href);
const WIN = process.platform === 'win32';
const link = (src, dst) => {
  if (!WIN) fs.symlinkSync(src, dst);
  else if (fs.statSync(src).isDirectory()) fs.symlinkSync(src, dst, 'junction');
  else fs.copyFileSync(src, dst);
};

for (const server of servers) {
  const builds = path.join(os.homedir(), '.local', 'share', server.QUESTS_UNIT_PREFIX, 'builds');
  const dir = path.join(builds, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(path.join(repo, 'dist-server'), path.join(dir, 'dist-server'), { recursive: true });
  for (const entry of fs.readdirSync(repo)) {
    if (entry !== 'dist-server' && entry !== '.git' && !entry.startsWith('dist-server.')) link(path.join(repo, entry), path.join(dir, entry));
  }
  if (!WIN) {
    fs.symlinkSync(id, path.join(builds, 'current.next'));
    fs.renameSync(path.join(builds, 'current.next'), path.join(builds, 'current'));
  }
  console.log(`snapshot-build: ${server.QUESTS_INSTANCE}: ${dir}`);

  // Builds in use: the ones open chat services run (chat_hosts.build); a missing table means none yet.
  let used = new Set();
  try {
    const db = new Database(server.DATABASE_PATH.replace(/^~/, os.homedir()), { readonly: true });
    used = new Set(db.prepare('SELECT build FROM chat_hosts WHERE ended_at IS NULL').all().map((r) => r.build));
  } catch (error) {
    console.log(`snapshot-build: no chat service records (${error.message}); keeping builds younger than a day`);
  }
  for (const old of fs.readdirSync(builds)) {
    const p = path.join(builds, old);
    if (old === id || old === 'current' || used.has(old)) continue;
    if (Date.now() - fs.statSync(p).mtimeMs > 86_400_000) fs.rmSync(p, { recursive: true, force: true });
  }
}
