"""Synthetic reference flow. No participant records are persisted."""
import json
from pathlib import Path
from dataclasses import asdict
from muscle_memory import Adventure, Challenge, Encounter, Attempt, assess

ROOT = Path(__file__).resolve().parents[2]

def load_reference():
    c = json.loads((ROOT / "content/challenges/frequency-map.v1.json").read_text())
    c["inputs_json"] = json.dumps(c.pop("inputs"))
    c["expected_json"] = json.dumps(c.pop("expected"))
    c["skills"], c["hints"] = tuple(c["skills"]), tuple(c["hints"])
    a = json.loads((ROOT / "content/adventures/field-notes.v1.json").read_text())
    a["challenges"] = tuple(tuple(ref) for ref in a["challenges"])
    return Adventure(**a), Challenge(**c)

def main():
    adventure, challenge = load_reference()
    attempt = Attempt("synthetic-attempt-1", "synthetic-participant-1", challenge.id,
                      challenge.version, challenge.digest, Encounter.from_adventure(adventure),
                      challenge.expected_json, "2026-01-01T00:00:00Z", "2026-01-01T00:01:00Z",
                      45, "synthetic-demo-v1", "unaided")
    print(json.dumps({"attempt": asdict(attempt), "assessment": asdict(assess(challenge, attempt))}, indent=2))

if __name__ == "__main__":
    main()
