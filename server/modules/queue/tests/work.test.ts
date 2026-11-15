import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { findTaskOutputFile, isTaskOutputFile, readOutputTail } from '../work.js';

test('quests: only a file under a /tmp/claude-* folder is served', () => {
  assert.equal(isTaskOutputFile('/tmp/claude-1000/-home-user-src-app/1a2b3c4d-1111-4222-8333-444455556666/tasks/bwy06286r.output', 'linux'), true);
  assert.equal(isTaskOutputFile('/tmp/claude-1a2b3c4d/watch_all.log', 'linux'), true);
  assert.equal(isTaskOutputFile('/tmp/claude-1000/-home-user/../../etc/passwd', 'linux'), false);
  assert.equal(isTaskOutputFile('/home/user/.claude/plans/x.md', 'linux'), false);
  assert.equal(isTaskOutputFile('/tmp/claude-1000/-home-user/1a2b3c4d-1111-4222-8333-444455556666/tasks/x.output/../y.output', 'linux'), false);
  assert.equal(isTaskOutputFile('/tmp/claude-x/..', 'linux'), false);
});

test('quests: on Windows only a file under %TEMP%\\claude is served', () => {
  const root = String.raw`C:\Users\a\AppData\Local\Temp\claude`;
  const ok = (file: string) => isTaskOutputFile(file, 'win32', root);
  assert.equal(ok(String.raw`C:\Users\a\AppData\Local\Temp\claude\9843\1a2b\tasks\b1.output`), true);
  assert.equal(ok('c:/users/a/appdata/local/temp/claude/9843/x.output'), true);
  assert.equal(ok(String.raw`C:\Users\a\AppData\Local\Temp\claude\..\secret.txt`), false);
  assert.equal(ok(String.raw`C:\Users\a\AppData\Local\Temp\claudeX\x.output`), false);
  assert.equal(ok(String.raw`C:\Users\a\.ssh\id_rsa`), false);
});

test('quests: a task output file is found by session and task id under /tmp/claude-<uid>', async () => {
  const root = process.platform === 'win32' ? path.join(os.tmpdir(), 'claude') : path.join(os.tmpdir(), `claude-${os.userInfo().uid}`);
  const sid = '00000000-0000-4000-8000-000000000001';
  const dir = path.join(root, '-quests-work-test', sid, 'tasks');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'b1.output'), 'x');
  assert.equal(findTaskOutputFile(sid, 'b1'), path.join(dir, 'b1.output'));
  assert.equal(findTaskOutputFile(sid, 'b2'), null);
  assert.equal(findTaskOutputFile('not-a-session', 'b1'), null);
  assert.equal(findTaskOutputFile(sid, '../b1'), null);
  await fsp.rm(path.join(root, '-quests-work-test'), { recursive: true });
});

test('quests: the tail of the output file, whole when small', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'quests-work-'));
  const file = path.join(dir, 'a.output');
  await fsp.writeFile(file, 'line one\nline two\n');
  const tail = await readOutputTail(file);
  assert.equal(tail.text, 'line one\nline two\n');
  assert.equal(tail.truncated, false);
  assert.equal(tail.size, 18);
  await fsp.rm(dir, { recursive: true });
});
