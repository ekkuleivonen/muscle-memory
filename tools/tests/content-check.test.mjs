import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkContent, requireSingleOwner, requireStableIdentity, validateChallenge, validateAdventure } from '../content-check.mjs';

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

test('issue keys never change meaning across versions', () => {
  const v1 = { ...challenge, number: 1 };
  const other = { ...challenge, id: 'ledger', number: 2 };
  const map = (...cs) => new Map(cs.map((c) => [`${c.id}@${c.version}`, c]));
  const project = { ...adventure, key: 'NB', challenges: [['tally', '1.0.0'], ['ledger', '1.0.0']] };
  requireStableIdentity([project], map(v1, other));
  assert.throws(() => validateChallenge({ ...challenge, number: 0 }), /number/);
  // A number cannot change between versions of an issue.
  assert.throws(() => requireStableIdentity([project], map(v1, { ...v1, version: '1.1.0', number: 3 }, other)), /number changed/);
  // A project keeps its key.
  assert.throws(() => requireStableIdentity([project, { ...project, version: '2.0.0', key: 'NX' }], map(v1, other)), /key changed/);
  // A dropped issue's number is never reused for another.
  const reuse = { ...challenge, id: 'abacus', number: 2 };
  assert.throws(
    () => requireStableIdentity([project, { ...project, version: '2.0.0', challenges: [['tally', '1.0.0'], ['abacus', '1.0.0']] }], map(v1, other, reuse)),
    /issue 2 changed from ledger to abacus/,
  );
  // All or none within a version, and distinct.
  assert.throws(() => requireStableIdentity([project], map(v1, { ...other, number: undefined })), /all of its Challenges or none/);
  assert.throws(() => requireStableIdentity([project], map(v1, { ...other, number: 1 })), /twice/);
});

test('a project key, set or derived from the id, names one project', () => {
  const map = (...cs) => new Map(cs.map((c) => [`${c.id}@${c.version}`, c]));
  const catalog = map(challenge, { ...challenge, id: 'ledger' });
  const notebook = { ...adventure, key: 'NB', challenges: [['tally', '1.0.0']] };
  const ledger = { ...adventure, id: 'ledger', challenges: [['ledger', '1.0.0']] };
  requireStableIdentity([notebook, ledger], catalog);
  assert.throws(() => requireStableIdentity([notebook, { ...ledger, key: 'NB' }], catalog), /notebook and ledger both use key NB/);
  // "night-book" derives NB, which notebook already claims.
  assert.throws(() => requireStableIdentity([notebook, { ...ledger, id: 'night-book' }], catalog), /key NB/);
  // Later versions of one project share its key.
  requireStableIdentity([notebook, { ...notebook, version: '2.0.0' }], catalog);
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
