import sys
import unittest
from dataclasses import replace
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "apps/reference"))
from demo import load_reference
from muscle_memory import Adventure, Encounter, Attempt, assess

class ContractsTest(unittest.TestCase):
    def setUp(self):
        self.adventure, self.challenge = load_reference()
        c = self.challenge
        self.attempt = Attempt("attempt-1", "participant-1", c.id, c.version, c.digest,
                               Encounter.from_adventure(self.adventure), c.expected_json,
                               "2026-01-01T00:00:00Z", "2026-01-01T00:01:00Z", 30,
                               "consent-v1", "unaided")

    def test_reference_is_reproducible(self):
        result = assess(self.challenge, self.attempt)
        self.assertEqual(result.correctness, 1)
        self.assertTrue(result.provisional)
        self.assertEqual(result, assess(self.challenge, self.attempt))

    def test_changed_content_cannot_reuse_attempt(self):
        with self.assertRaises(ValueError):
            assess(replace(self.challenge, task="changed story-independent task"), self.attempt)

    def test_context_and_hints_remain_distinct(self):
        encounter = Encounter.from_adventure(self.adventure, clues_shown=("tally-clue-v1",))
        attempt = replace(self.attempt, encounter=encounter, hints_shown=(0,), assistance="assisted")
        self.assertEqual(assess(self.challenge, attempt).correctness, 1)
        self.assertNotEqual(attempt.encounter, self.attempt.encounter)

    def test_multiple_pinned_challenges(self):
        a = replace(self.adventure, challenges=(("another", "1.0.0"), (self.challenge.id, self.challenge.version)))
        attempt = replace(self.attempt, encounter=Encounter.from_adventure(a, 1))
        self.assertEqual(assess(self.challenge, attempt).correctness, 1)
        with self.assertRaises(ValueError):
            assess(self.challenge, replace(attempt, encounter=Encounter.from_adventure(a, 0)))

    def test_partial_correctness(self):
        attempt = replace(self.attempt, outputs_json='[{"a":2,"b":1},{},{},{}]')
        self.assertEqual(assess(self.challenge, attempt).correctness, .5)

    def test_boolean_is_not_a_count(self):
        c = replace(self.challenge, inputs_json='[["a"]]', expected_json='[{"a":1}]')
        attempt = replace(self.attempt, challenge_digest=c.digest, outputs_json='[{"a":true}]')
        self.assertEqual(assess(c, attempt).correctness, 0)

    def test_invalid_attempts(self):
        for changes in ({"consent_version":""}, {"active_seconds":float("nan")},
                        {"active_seconds":61}, {"submitted_at":"2025-01-01T00:00:00Z"},
                        {"started_at":"2026-01-01T00:00:00"}, {"assistance":"inferred"},
                        {"participant_id":"email@example.com"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                replace(self.attempt, **changes)

    def test_wrong_shape_and_hint_fail(self):
        for changes in ({"outputs_json":"[]"}, {"hints_shown":(99,)}, {"challenge_digest":"bad"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                assess(self.challenge, replace(self.attempt, **changes))

    def test_content_cannot_be_unpinned(self):
        with self.assertRaises(ValueError):
            replace(self.adventure, challenges=(("frequency-map", "latest"),))

if __name__ == "__main__":
    unittest.main()
