import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { unitPrefix } from '@/shared/quests-instance.js';

/**
 * quests: the long-lived processes of a server, a chat service (<prefix>-chat-<id>) or a listener
 * (<prefix>-listen-<id>). On Linux each is a systemd user unit: systemd refuses a second unit of the same name,
 * restarts nothing by itself (--collect), and the unit outlives the page server. Elsewhere (Windows, macOS) each is
 * a detached process whose pid is kept in ~/.local/state/<prefix>/units/<unit>.pid; quests/bin/quests-listen writes
 * the same files for the listeners it starts.
 */

const run = promisify(execFile);

/** True where systemd user units run the processes. */
export const SYSTEMD = process.platform === 'linux';

const pidDir = (): string => path.join(os.homedir(), '.local', 'state', unitPrefix(), 'units');
const pidFile = (unit: string): string => path.join(pidDir(), `${unit}.pid`);

// ponytail: a pid alone can be reused by an unrelated process after a crash; record the start time too if that bites.
function pidAlive(file: string): boolean {
  try {
    process.kill(Number(fs.readFileSync(file, 'utf8')), 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Used by hosts.ts: whether the unit runs now. */
export async function unitActive(unit: string): Promise<boolean> {
  if (!SYSTEMD) return pidAlive(pidFile(unit));
  const { stdout } = await run('systemctl', ['--user', 'is-active', `${unit}.service`]).catch((e: { stdout?: string }) => ({ stdout: e.stdout ?? '' }));
  return ['active', 'activating', 'deactivating'].includes(stdout.trim());
}

/** Used by manager.ts: the ids (the unit name after the prefix) of the running units whose name starts with prefix. */
export async function activeUnits(prefix: string): Promise<Set<string>> {
  if (SYSTEMD) {
    const { stdout } = await run('systemctl', ['--user', 'list-units', `${prefix}*`, '--state=active,activating', '--plain', '--no-legend']);
    return new Set(stdout.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean).map((u) => u.slice(prefix.length, -'.service'.length)));
  }
  let files: string[] = [];
  try { files = fs.readdirSync(pidDir()); } catch { /* nothing started yet */ }
  const ids = new Set<string>();
  for (const f of files.filter((x) => x.startsWith(prefix) && x.endsWith('.pid'))) {
    if (pidAlive(path.join(pidDir(), f))) ids.add(f.slice(prefix.length, -'.pid'.length));
    else fs.rmSync(path.join(pidDir(), f), { force: true });
  }
  return ids;
}

/** How to run a unit: systemd's command line, and the command a detached process runs elsewhere. */
type UnitSpec = {
  unit: string;
  description: string;
  /** The command systemd-run starts (it gets an empty environment, so a script that loads the server's). */
  systemd: string[];
  /** The command started as a detached process; it inherits the page server's environment plus env. */
  detached: { command: string[]; cwd: string; env: Record<string, string> };
};

/** Used by hosts.ts and manager.ts: starts the unit; QUESTS_INSTANCE is always passed on. */
export async function startUnit(spec: UnitSpec): Promise<void> {
  const instance = process.env.QUESTS_INSTANCE ?? '';
  if (SYSTEMD) {
    await run('systemd-run', ['--user', '--collect', '--unit', spec.unit, `--description=${spec.description}`, `--setenv=QUESTS_INSTANCE=${instance}`, ...spec.systemd]);
    return;
  }
  fs.mkdirSync(pidDir(), { recursive: true });
  const log = fs.openSync(path.join(pidDir(), `${spec.unit}.log`), 'a');
  const [command, ...args] = spec.detached.command;
  const child = spawn(command, args, {
    cwd: spec.detached.cwd,
    env: { ...process.env, ...spec.detached.env, QUESTS_INSTANCE: instance },
    detached: true,
    windowsHide: true,
    stdio: ['ignore', log, log],
  });
  fs.closeSync(log);
  if (!child.pid) throw new Error(`could not start ${spec.unit}`);
  fs.writeFileSync(pidFile(spec.unit), String(child.pid));
  child.unref();
}
