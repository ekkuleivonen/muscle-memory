import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkContent, validateChallenge, validateAdventure } from '../content-check.mjs';

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
