import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { projectsDb } from '@/modules/database/index.js';
import { questsTz, questsUser, repoOf, servesPath, ticketsRepo } from '@/shared/quests-instance.js';
import { manifestOf } from '@/shared/quests-repo.js';
import type { QuestsManifest } from '@/shared/quests-repo.js';
import { AppError } from '@/shared/utils.js';

/**
 * quests: the "Personalize" form of the page. It edits the two sides of quests/INTERFACE.md a user owns: a repo's
 * quests.json (with the closing-steps file it names) and the user's own settings in ~/.config/quests/user.env.
 * Nothing here is needed to run: every value has a default.
 */

/** One repo as the form shows it. `areas` is the area words, or "$ <command>" for a repo whose areas come from a command. */
export type RepoSettings = {
  path: string;
  name: string;
  enabled: boolean;
  areas: string;
  finishFile: string;
  finishSteps: string;
  finishCommand: string;
  drawerQuestion: string;
};

/** The user's own settings. An empty tickets repo means no tickets; an empty time zone the system's. */
export type UserSettings = { user: string; timeZone: string; ticketsRepo: string };

const bad = (message: string) => new AppError(message, { code: 'INVALID_REQUEST_BODY', statusCode: 400 });
const DEFAULT_FINISH_FILE = 'quests-finish.md';
const WORDS = /^printf '%s\\n' ((?:[\w-]+ ?)+)$/;

/** quests.json's "areas" command for the form's text: plain words become a printf, "$ <command>" stays a command. */
export function areasToCommand(text: string): string {
  const t = text.trim();
  if (!t) return '';
  if (t.startsWith('$')) return t.slice(1).trim();
  const words = t.split(/[\s,]+/).filter(Boolean);
  // The words go into a shell command, so only plain ones pass.
  const odd = words.find((w) => !/^[\w-]+$/.test(w));
  if (odd) throw bad(`"${odd}" is not a plain area word (letters, digits, - and _). Start the line with $ for a command.`);
  return `printf '%s\\n' ${words.join(' ')}`;
}

/** The form's text for an "areas" command: the words of a printf this form wrote, else "$ <command>". */
export function commandToAreas(command: string | undefined): string {
  if (!command) return '';
  const words = WORDS.exec(command)?.[1];
  return words ?? `$ ${command}`;
}

/** The finish file, kept inside the repo: relative, with no "..". */
function finishPath(repo: string, file: string): string {
  if (path.isAbsolute(file) || file.split(/[\\/]/).includes('..')) throw bad('The closing-steps file must be a path inside the repo.');
  return path.join(repo, file);
}

function readRepo(projectPath: string, name: string): RepoSettings {
  const repo = repoOf(projectPath);
  const m = manifestOf(repo);
  const finishFile = m?.finish ?? '';
  let finishSteps = '';
  try { if (finishFile) finishSteps = fs.readFileSync(finishPath(repo, finishFile), 'utf8'); } catch { /* named but not written yet */ }
  return {
    path: repo, name, enabled: Boolean(m), areas: commandToAreas(m?.areas), finishFile, finishSteps,
    finishCommand: m?.finish_command ?? '', drawerQuestion: m?.drawer_question ?? '',
  };
}

/** The repos this server serves, one per project (a worktree counts as its repo). */
export function listRepos(): RepoSettings[] {
  const seen = new Set<string>();
  const repos: RepoSettings[] = [];
  for (const p of projectsDb.getProjectPaths()) {
    const repo = repoOf(p.project_path);
    if (seen.has(repo.toLowerCase()) || !servesPath(repo) || !fs.existsSync(repo)) continue;
    seen.add(repo.toLowerCase());
    repos.push(readRepo(repo, p.custom_project_name ?? path.basename(repo)));
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

/** Writes one repo's quests.json (or removes it: quests off) and its closing-steps file. Only a listed repo is written. */
export function saveRepo(input: RepoSettings): RepoSettings {
  const known = listRepos().find((r) => r.path.toLowerCase() === String(input.path).toLowerCase());
  if (!known) throw bad('That folder is not a project of this server.');
  const file = path.join(known.path, 'quests.json');
  if (!input.enabled) {
    fs.rmSync(file, { force: true });
    return readRepo(known.path, known.name);
  }
  const steps = input.finishSteps.trim();
  const finishFile = input.finishFile.trim() || (steps ? DEFAULT_FINISH_FILE : '');
  const manifest: QuestsManifest = {};
  const areas = areasToCommand(input.areas);
  if (areas) manifest.areas = areas;
  if (finishFile) manifest.finish = finishFile;
  if (input.finishCommand.trim()) manifest.finish_command = input.finishCommand.trim();
  if (input.drawerQuestion.trim()) manifest.drawer_question = input.drawerQuestion.trim();
  if (finishFile && steps) {
    const target = finishPath(known.path, finishFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${steps}\n`);
  }
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return readRepo(known.path, known.name);
}

const USER_ENV = path.join(os.homedir(), '.config', 'quests', 'user.env');

export function readUser(): UserSettings {
  return { user: questsUser(), timeZone: questsTz(), ticketsRepo: ticketsRepo() };
}

/**
 * Writes the user's settings to ~/.config/quests/user.env, keeping its other lines, and sets them on this process,
 * so the page server uses them at once. A chat already running keeps the values it started with.
 */
export function saveUser(input: UserSettings, file = USER_ENV): UserSettings {
  const user = input.user.trim();
  const timeZone = input.timeZone.trim();
  const repo = input.ticketsRepo.trim();
  if (!user || /[\r\n]/.test(user)) throw bad('The name cannot be empty.');
  if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw bad('The tickets repo is "owner/name", or empty for none.');
  try { if (timeZone) new Intl.DateTimeFormat('en', { timeZone }); } catch { throw bad(`"${timeZone}" is not a time zone (for example Europe/Paris).`); }
  const next: Record<string, string> = { QUESTS_USER: user, QUESTS_TZ: timeZone, TICKETS_REPO: repo };
  const kept = (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [])
    .filter((l) => l.trim() && !Object.keys(next).some((k) => l.startsWith(`${k}=`)));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${[...Object.entries(next).map(([k, v]) => `${k}=${v}`), ...kept].join('\n')}\n`);
  Object.assign(process.env, next);
  return readUser();
}
