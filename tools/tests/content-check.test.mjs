import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkContent, requireSingleOwner, validateChallenge, validateAdventure } from '../content-check.mjs';

const challenge = { id: 'tally', version: '1.0.0', assessment_version: '1.0.0', task: 'Count labels', skills: ['maps'], hints: [], inputs: [[]], expected: [{}] };
const adventure = { id: 'notebook', version: '1.0.0', story: 'Read the notebook', presentation: 'text-v1', challenges: [['tally', '1.0.0']] };

test('validates pinned content and rejects missing versions', () => {
  const catalog = new Map([['tally@1.0.0', challenge]]);
  assert.equal(validateAdventure(adventure, catalog), adventure);
  assert.throws(() => validateAdventure({ ...adventure, challenges: [['tally', 'latest']] }, catalog), /pin/);
  assert.throws(() => validateAdventure({ ...adventure, challenges: [['tally', '2.0.0']] }, catalog), /Missing Challenge/);
  assert.throws(() => validateChallenge({ ...challenge, expected: [] }), /Every input/);
  assert.throws(() => validateChallenge({ ...challenge, id: undefined }), /safe id/);
  assert.throws(() => validateChallenge({ ...challenge, version: 1 }), /explicit version/);
});

test('accepts optional display metadata and rejects malformed values', () => {
  const titled = { ...challenge, title: 'Tally', summary: 'Count labels exactly.', difficulty: 'warm-up' };
  assert.equal(validateChallenge(titled), titled);
  assert.throws(() => validateChallenge({ ...challenge, title: ' ' }), /title/);
  assert.throws(() => validateChallenge({ ...challenge, summary: 'x'.repeat(161) }), /summary/);
  assert.throws(() => validateChallenge({ ...challenge, difficulty: 'trivial' }), /difficulty/);
  const issue = { ...titled, kind: 'bug', comments: [{ author: 'Priya K', role: 'Data', body: 'Case matters.' }] };
  assert.equal(validateChallenge(issue), issue);
  assert.throws(() => validateChallenge({ ...challenge, kind: 'chore' }), /kind/);
  assert.throws(() => validateChallenge({ ...challenge, comments: {} }), /comments/);
  assert.throws(() => validateChallenge({ ...challenge, comments: [{ author: 'Priya K', body: '' }] }), /comment/);
  const catalog = new Map([['tally@1.0.0', challenge]]);
  assert.ok(validateAdventure({ ...adventure, title: 'Notebook' }, catalog));
  assert.throws(() => validateAdventure({ ...adventure, difficulty: 'easy' }, catalog), /comes from its Challenges/);
  assert.ok(validateAdventure({ ...adventure, key: 'NB2' }, catalog));
  for (const key of ['nb', 'N', '2NB', 'NOTEBK'])
    assert.throws(() => validateAdventure({ ...adventure, key }, catalog), /key/);
});

test('an issue belongs to one project, once', () => {
  const catalog = new Map([['tally@1.0.0', challenge]]);
  assert.throws(() => validateAdventure({ ...adventure, challenges: [['tally', '1.0.0'], ['tally', '1.0.0']] }, catalog), /once/);
  requireSingleOwner([adventure, { ...adventure, version: '2.0.0' }]);
  assert.throws(() => requireSingleOwner([adventure, { ...adventure, id: 'ledger' }]), /pinned by both notebook and ledger/);
});

test('rejects duplicate content identities across files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'muscle-memory-content-'));
  try {
    await mkdir(join(root, 'adventures'));
    await mkdir(join(root, 'challenges'));
    await writeFile(join(root, 'adventures', 'notebook.json'), JSON.stringify(adventure));
    await writeFile(join(root, 'challenges', 'tally.json'), JSON.stringify(challenge));
    assert.deepEqual(await checkContent(root), { adventures: 1, challenges: 1 });
    await writeFile(join(root, 'challenges', 'duplicate.json'), JSON.stringify(challenge));
    await assert.rejects(checkContent(root), /Duplicate Challenge/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
