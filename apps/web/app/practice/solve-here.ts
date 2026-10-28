/** Set for the tab once someone chooses to solve on a phone anyway. Never recorded. */
export const SOLVE_HERE_KEY = "muscle-memory.solve-here";

type Session = () => Pick<Storage, "getItem" | "setItem">;
// Reached inside the try: where site data is blocked, even touching sessionStorage throws.
const session: Session = () => sessionStorage;

/** Whether this tab chose to solve here; storage that can't be read means not yet. */
export function readSolveHere(storage: Session = session): boolean {
  try {
    return storage().getItem(SOLVE_HERE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Remembers the choice for the tab, best effort: the choice holds on this page regardless. */
export function rememberSolveHere(storage: Session = session): void {
  try {
    storage().setItem(SOLVE_HERE_KEY, "1");
  } catch {}
}
