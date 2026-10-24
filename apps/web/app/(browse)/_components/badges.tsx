import type {
  Difficulty,
  IssueKind,
} from "../../../../../packages/domain/assessment";
import { languageLabel } from "../../../lib/library";

export function KindBadge({ kind }: { kind?: IssueKind }) {
  return kind ? (
    <span className={`badge kind kind-${kind}`}>{kind}</span>
  ) : null;
}

export function DifficultyBadge({ difficulty }: { difficulty?: Difficulty }) {
  return difficulty ? <span className="badge">{difficulty}</span> : null;
}

export function LanguageBadge({ language }: { language?: string }) {
  return <span className="badge">{languageLabel(language)}</span>;
}

export function RunBadge({ runnable }: { runnable: boolean }) {
  return runnable ? (
    <span className="badge runs">Runs in your browser</span>
  ) : (
    <span className="badge read-only">Read-only for now</span>
  );
}
