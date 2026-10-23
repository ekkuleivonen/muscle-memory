"""Immutable v1 contracts; persistence and presentation live outside this module."""
from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
import math
import re


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}", value):
        raise ValueError("Expected an opaque identifier (1–128 safe characters)")


def version(value):
    if not isinstance(value, str) or not re.fullmatch(r"[1-9][0-9]*\.[0-9]+\.[0-9]+", value):
        raise ValueError("Expected an explicit semantic version")


def json_text(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


@dataclass(frozen=True)
class Challenge:
    id: str
    version: str
    task: str
    skills: tuple[str, ...]
    hints: tuple[str, ...]
    inputs_json: str
    expected_json: str
    assessment_version: str = "1.0.0"

    def __post_init__(self):
        identifier(self.id)
        version(self.version)
        version(self.assessment_version)
        inputs, expected = json.loads(self.inputs_json), json.loads(self.expected_json)
        if not isinstance(inputs, list) or not inputs or not isinstance(expected, list) or len(inputs) != len(expected):
            raise ValueError("One expected JSON output is required per fixture")
        json_text(inputs)
        json_text(expected)
        if not isinstance(self.skills, tuple) or not isinstance(self.hints, tuple):
            raise ValueError("Skills and hints must be immutable tuples")

    @property
    def digest(self):
        from dataclasses import asdict
        return hashlib.sha256(json_text(asdict(self)).encode()).hexdigest()


@dataclass(frozen=True)
class Adventure:
    id: str
    version: str
    story: str
    presentation: str
    challenges: tuple[tuple[str, str], ...]

    def __post_init__(self):
        identifier(self.id)
        version(self.version)
        if not isinstance(self.challenges, tuple) or not self.challenges:
            raise ValueError("Adventure must contain pinned Challenges")
        for ref in self.challenges:
            if not isinstance(ref, tuple) or len(ref) != 2:
                raise ValueError("Immutable (id, version) references required")
            identifier(ref[0])
            version(ref[1])


@dataclass(frozen=True)
class Encounter:
    adventure_id: str
    adventure_version: str
    challenge_order: tuple[tuple[str, str], ...]
    position: int
    presentation: str
    clues_shown: tuple[str, ...] = ()

    @classmethod
    def from_adventure(cls, adventure, position=0, clues_shown=()):
        if type(position) is not int or not 0 <= position < len(adventure.challenges):
            raise ValueError("Invalid encounter position")
        return cls(adventure.id, adventure.version, adventure.challenges, position,
                   adventure.presentation, tuple(clues_shown))


@dataclass(frozen=True)
class Attempt:
    id: str
    participant_id: str
    challenge_id: str
    challenge_version: str
    challenge_digest: str
    encounter: Encounter
    outputs_json: str
    started_at: str
    submitted_at: str
    active_seconds: float
    consent_version: str
    assistance: str = "undisclosed"
    hints_shown: tuple[int, ...] = ()

    def __post_init__(self):
        for value in (self.id, self.participant_id, self.challenge_id):
            identifier(value)
        version(self.challenge_version)
        if not self.consent_version:
            raise ValueError("Explicit consent version required")
        if self.assistance not in ("unaided", "assisted", "undisclosed"):
            raise ValueError("Unknown assistance disclosure")
        times = [datetime.fromisoformat(t.replace("Z", "+00:00")) for t in (self.started_at, self.submitted_at)]
        if any(t.tzinfo is None for t in times) or times[1] < times[0]:
            raise ValueError("Ordered timezone-aware timestamps required")
        if type(self.active_seconds) not in (int, float) or not math.isfinite(self.active_seconds) or not 0 <= self.active_seconds <= (times[1]-times[0]).total_seconds():
            raise ValueError("Active time must fit within elapsed time")
        if not isinstance(json.loads(self.outputs_json), list):
            raise ValueError("Outputs must be a JSON array")
        json_text(json.loads(self.outputs_json))


@dataclass(frozen=True)
class Assessment:
    attempt_id: str
    assessment_version: str
    challenge_digest: str
    passed: tuple[bool, ...]
    correctness: float
    feedback: str
    provisional: bool = True
    schema_version: str = "1.0.0"


def assess(challenge, attempt):
    """Compare bounded JSON fixture outputs. Never compile/eval/execute submissions."""
    if (attempt.challenge_id, attempt.challenge_version, attempt.challenge_digest) != (challenge.id, challenge.version, challenge.digest):
        raise ValueError("Attempt must pin the exact Challenge content")
    context = attempt.encounter
    if type(context.position) is not int or not 0 <= context.position < len(context.challenge_order) or context.challenge_order[context.position] != (challenge.id, challenge.version):
        raise ValueError("Encounter order must match the attempted Challenge")
    if any(type(i) is not int or not 0 <= i < len(challenge.hints) for i in attempt.hints_shown):
        raise ValueError("Unknown hint")
    expected, actual = json.loads(challenge.expected_json), json.loads(attempt.outputs_json)
    if len(actual) != len(expected):
        raise ValueError("Exactly one output per fixture required")
    if len(attempt.outputs_json.encode()) > 65536:
        raise ValueError("Submission exceeds 64 KiB")
    # Canonical JSON avoids Python's True == 1 equality trap.
    passed = tuple(json_text(a) == json_text(e) for a, e in zip(actual, expected))
    count = sum(passed)
    return Assessment(attempt.id, challenge.assessment_version, challenge.digest, passed,
                      count / len(expected),
                      f"{count}/{len(expected)} fixtures correct. Review edge cases; this is task feedback, not a skill ranking.")
