/** Build-time authoring checks. No participant data, networking or code execution. */
import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ownPath = fileURLToPath(import.meta.url);
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const idPattern = /^[a-z0-9][a-z0-9-]{0,127}$/;

function safeId(value) {
  return typeof value === 'string' && idPattern.test(value);
}

function pinnedVersion(value) {
  return typeof value === 'string' && versionPattern.test(value);
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

export const difficulties = ['warm-up', 'easy', 'medium', 'hard'];
/** Issue kinds; each implies how a Challenge starts (stub, broken code, slow code, messy code). */
export const issueKinds = ['feature', 'bug', 'performance', 'refactor'];

function boundedText(value, limit) {
  return typeof value === 'string' && value.trim() !== '' && value.length <= limit;
}

/** Optional display metadata; older published versions have none. */
function validateDisplay(content, label) {
  for (const [key, limit] of [['title', 60], ['summary', 160]]) {
    if (content[key] === undefined) continue;
    requireValue(boundedText(content[key], limit), `${label} ${key} must be 1-${limit} characters`);
  }
}

export function validateChallenge(challenge) {
  requireValue(challenge && safeId(challenge.id), 'Challenge needs a safe id');
  requireValue(pinnedVersion(challenge.version), 'Challenge needs an explicit version');
  requireValue(pinnedVersion(challenge.assessment_version), 'Challenge needs an assessment version');
  requireValue(typeof challenge.task === 'string' && challenge.task.trim(), 'Challenge needs a task');
  for (const key of ['skills', 'hints']) {
    requireValue(Array.isArray(challenge[key]) && challenge[key].every(value => typeof value === 'string'), `Challenge ${key} must be strings`);
  }
  requireValue(Array.isArray(challenge.inputs) && challenge.inputs.length > 0, 'Challenge needs input fixtures');
  requireValue(Array.isArray(challenge.expected) && challenge.expected.length === challenge.inputs.length, 'Every input needs one expected output');
  validateDisplay(challenge, 'Challenge');
  if (challenge.difficulty !== undefined)
    requireValue(difficulties.includes(challenge.difficulty), `Challenge difficulty must be one of ${difficulties.join(', ')}`);
  if (challenge.kind !== undefined)
    requireValue(issueKinds.includes(challenge.kind), `Challenge kind must be one of ${issueKinds.join(', ')}`);
  if (challenge.comments !== undefined) {
    requireValue(Array.isArray(challenge.comments), 'Challenge comments must be a list');
    for (const comment of challenge.comments)
      requireValue(
        comment && boundedText(comment.author, 40) && (comment.role === undefined || boundedText(comment.role, 40)) && boundedText(comment.body, 1000),
        'Each comment needs an author (up to 40 characters), an optional role and a body (up to 1000)',
      );
  }
  return challenge;
}

/**
 * An issue belongs to one project: across Adventure ids, each Challenge id is pinned by at
 * most one. Versions of the same Adventure may keep pinning it.
 */
export function requireSingleOwner(adventures) {
  const owners = new Map();
  for (const adventure of adventures)
    for (const [id] of adventure.challenges ?? []) {
      const owner = owners.get(id);
      requireValue(!owner || owner === adventure.id, `Challenge ${id} is pinned by both ${owner} and ${adventure.id}; an issue belongs to one project`);
      owners.set(id, adventure.id);
    }
}

export function validateAdventure(adventure, challenges) {
  requireValue(adventure && safeId(adventure.id), 'Adventure needs a safe id');
  requireValue(pinnedVersion(adventure.version), 'Adventure needs an explicit version');
  for (const key of ['story', 'presentation']) {
    requireValue(typeof adventure[key] === 'string' && adventure[key].trim(), `Adventure needs ${key}`);
  }
  requireValue(Array.isArray(adventure.challenges) && adventure.challenges.length > 0, 'Adventure needs pinned Challenges');
  for (const ref of adventure.challenges) {
    requireValue(Array.isArray(ref) && ref.length === 2 && safeId(ref[0]) && pinnedVersion(ref[1]), 'Adventure references must pin [id, version]');
    requireValue(challenges.has(`${ref[0]}@${ref[1]}`), `Missing Challenge ${ref[0]}@${ref[1]}`);
  }
  const ids = adventure.challenges.map(([id]) => id);
  requireValue(new Set(ids).size === ids.length, 'An Adventure pins each Challenge once');
  requireValue(adventure.difficulty === undefined, 'Adventure difficulty comes from its Challenges');
  // Prefix for issue keys such as NS-2.
  if (adventure.key !== undefined)
    requireValue(typeof adventure.key === 'string' && /^[A-Z][A-Z0-9]{1,4}$/.test(adventure.key), 'Adventure key must be 2-5 uppercase letters or digits, starting with a letter');
  validateDisplay(adventure, 'Adventure');
  return adventure;
}

async function loadManifests(directory) {
  const names = (await readdir(directory)).filter(name => name.endsWith('.json')).sort();
  return Promise.all(names.map(async name => ({ name, value: JSON.parse(await readFile(resolve(directory, name), 'utf8')) })));
}

export async function checkContent(root) {
  const challenges = new Map();
  for (const { name, value } of await loadManifests(resolve(root, 'challenges'))) {
    validateChallenge(value);
    const key = `${value.id}@${value.version}`;
    requireValue(!challenges.has(key), `Duplicate Challenge ${key} (${name})`);
    challenges.set(key, value);
  }
  const adventures = new Map();
  for (const { name, value } of await loadManifests(resolve(root, 'adventures'))) {
    validateAdventure(value, challenges);
    const key = `${value.id}@${value.version}`;
    requireValue(!adventures.has(key), `Duplicate Adventure ${key} (${name})`);
    adventures.set(key, value);
  }
  requireValue(challenges.size > 0 && adventures.size > 0, 'Content needs at least one Adventure and Challenge');
  requireSingleOwner(adventures.values());
  return { challenges: challenges.size, adventures: adventures.size };
}

if (process.argv[1] && resolve(process.argv[1]) === ownPath) {
  try {
    const result = await checkContent(resolve(dirname(ownPath), '../content'));
    console.log(`Content valid: ${result.adventures} Adventure(s), ${result.challenges} Challenge(s).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
