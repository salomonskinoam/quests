import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * quests: which server this process is. N servers run side by side, each one the user unit quests-ui@<instance>,
 * with its environment from ~/.config/quests/user.env (the user's: tickets repo, name, time zone) and then
 * ~/.config/quests/<instance>.env (the server's: port, database, unit prefix, project roots; it may override the
 * tickets repo). The contract: quests/INTERFACE.md. Every value has a default, the same ones quests/lib/quests_env.py
 * gives the scripts, so a server runs with no file at all.
 */

const CONFIG_DIR = path.join(os.homedir(), '.config', 'quests');


// Paths compare case-blind on Windows, where C:\Src and c:\src are one folder.
const norm = (p: string): string => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
/** PROJECT_ROOTS is a list in the platform's PATH style: `:`-separated, `;` on Windows. */
const rootsOf = (value: string | undefined): string[] => (value ?? '').split(path.delimiter).filter(Boolean).map(norm);

/** The tickets repo, `owner/name`, or '' when the user has none: the queue then holds chats only. */
export const ticketsRepo = (): string => process.env.TICKETS_REPO ?? '';
export const questsUser = (): string => process.env.QUESTS_USER || os.userInfo().username;
export const questsTz = (): string => process.env.QUESTS_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
/** Units are <prefix>-chat-<id> and <prefix>-listen-<id>; the socket folder and the builds folder carry it too. */
export const unitPrefix = (): string => process.env.QUESTS_UNIT_PREFIX || 'quests';

/** The PROJECT_ROOTS of every other instance file: the main server (no roots of its own) shows all but these. */
function otherRoots(): string[] {
  const me = process.env.QUESTS_INSTANCE || 'main';
  if (!fs.existsSync(CONFIG_DIR)) return [];
  return fs.readdirSync(CONFIG_DIR)
    .filter((f) => f.endsWith('.env') && f !== 'user.env' && f !== `${me}.env`)
    .flatMap((f) => rootsOf(fs.readFileSync(path.join(CONFIG_DIR, f), 'utf8').match(/^PROJECT_ROOTS=(.*)$/m)?.[1]));
}

/** A worktree of Claude Code (<repo>/.claude/worktrees/<name>) belongs to its repo. */
export const repoOf = (projectPath: string): string => projectPath.replace(/[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/, '');

const under = (p: string, roots: string[]): boolean => {
  const n = norm(p);
  return roots.some((r) => n === r || n.startsWith(r.endsWith(path.sep) ? r : r + path.sep));
};

let cache: { own: string[]; others: string[] } | null = null;

/** Whether a chat or project at this path is this server's. An unknown path is the main server's. */
export function servesPath(projectPath: string | null | undefined): boolean {
  cache ??= { own: rootsOf(process.env.PROJECT_ROOTS), others: otherRoots() };
  if (cache.own.length) return !!projectPath && under(repoOf(projectPath), cache.own);
  return !projectPath || !under(repoOf(projectPath), cache.others);
}
