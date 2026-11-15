import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { areasToCommand, commandToAreas, saveUser } from '../personalize.service.js';

test('personalize: area words become a printf and come back as words; a command stays a command', () => {
  assert.equal(areasToCommand('extension, tests  store'), "printf '%s\\n' extension tests store");
  assert.equal(commandToAreas("printf '%s\\n' extension tests store"), 'extension tests store');
  assert.equal(areasToCommand('$ cat areas.txt'), 'cat areas.txt');
  assert.equal(commandToAreas('cat areas.txt'), '$ cat areas.txt');
  assert.equal(areasToCommand('  '), '');
  assert.equal(commandToAreas(undefined), '');
});

test('personalize: an area word cannot carry shell syntax', () => {
  assert.throws(() => areasToCommand('tests; rm -rf ~'));
  assert.throws(() => areasToCommand('a $(whoami)'));
});

test('personalize: the user settings are written to user.env, other lines kept, bad values refused', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quests-personalize-')), 'user.env');
  fs.writeFileSync(file, 'QUESTS_HOME=/x/quests\nQUESTS_USER=Old\n');
  const before = { ...process.env };
  try {
    const saved = saveUser({ user: 'Ann', timeZone: 'Europe/Paris', ticketsRepo: 'ann/tickets' }, file);
    assert.deepEqual(saved, { user: 'Ann', timeZone: 'Europe/Paris', ticketsRepo: 'ann/tickets' });
    assert.equal(fs.readFileSync(file, 'utf8'), 'QUESTS_USER=Ann\nQUESTS_TZ=Europe/Paris\nTICKETS_REPO=ann/tickets\nQUESTS_HOME=/x/quests\n');
    assert.throws(() => saveUser({ user: 'Ann', timeZone: 'Mars/Phobos', ticketsRepo: '' }, file));
    assert.throws(() => saveUser({ user: 'Ann', timeZone: 'UTC', ticketsRepo: 'not a repo' }, file));
    assert.throws(() => saveUser({ user: ' ', timeZone: 'UTC', ticketsRepo: '' }, file));
  } finally {
    for (const k of ['QUESTS_USER', 'QUESTS_TZ', 'TICKETS_REPO']) {
      if (before[k] === undefined) delete process.env[k]; else process.env[k] = before[k];
    }
  }
});
