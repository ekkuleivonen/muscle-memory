import json
import unittest

import aggregate


def row(participant, type_, when, data):
    return {"participant_id": participant, "type": type_, "occurred_at": when, "payload": json.dumps({"data": data})}


def result(participant, when, t, w=40, issue="QUICK-1"):
    return row(participant, "observation.board.result", when,
               {"issueKey": issue, "language": "python", "metrics": 2, "values": {"t": t, "w": w}})


class AggregateTest(unittest.TestCase):
    def test_first_finishes_only_without_stealth_or_deleted_players(self):
        rows = [
            result("a", "2026-10-25T10:00:00Z", 100),
            result("a", "2026-10-25T11:00:00Z", 10),  # a second finish does not count
            result("b", "2026-10-25T10:00:00Z", 200, w=0),  # no speed: left out of speed only
            result("c", "2026-10-25T10:00:00Z", 300),
            result("gone", "2026-10-25T10:00:00Z", 5),
            result("hidden", "2026-10-25T10:00:00Z", 1),
            row("hidden", "observation.board.profile", "2026-10-25T09:00:00Z", {"answers": {"stealth": True}}),
            row("c", "observation.board.profile", "2026-10-25T09:00:00Z", {"answers": {"stealth": True}}),
            row("c", "observation.board.profile", "2026-10-25T09:30:00Z", {"answers": {"stealth": False}}),
        ]
        issues = aggregate.summarize(rows, excluded={"gone"})
        quick = issues["QUICK-1"]
        self.assertEqual(quick["n"], 3)
        self.assertEqual(quick["t"][0], 100)
        self.assertEqual(quick["t"][50], 200)
        self.assertEqual(quick["t"][100], 300)
        self.assertEqual(len(quick["t"]), 101)
        self.assertEqual(quick["w"][0], 40)
        self.assertEqual(quick["language"], "python")


if __name__ == "__main__":
    unittest.main()
