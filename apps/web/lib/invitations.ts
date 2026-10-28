/**
 * Optional profile invitations a person has hidden, kept on this device only. Hiding one is a
 * display choice: it records no event and changes no answer. Settings still asks every question.
 */
export const DISMISSED_KEY = "muscle-memory.dismissed";
export type Invitation = "languages";

type Read = Pick<Storage, "getItem">;
type Write = Pick<Storage, "getItem" | "setItem">;

/** Hidden invitations; unreadable storage reads as none hidden. */
export function readDismissed(storage: Read): Set<Invitation> {
  try {
    const list = JSON.parse(storage.getItem(DISMISSED_KEY) ?? "[]");
    return new Set(Array.isArray(list) ? list.filter((x): x is Invitation => x === "languages") : []);
  } catch {
    return new Set();
  }
}

/** Remember a hidden invitation. False when storage refused, so it is hidden for this view only. */
export function dismiss(id: Invitation, storage: Write): boolean {
  try {
    const hidden = readDismissed(storage).add(id);
    storage.setItem(DISMISSED_KEY, JSON.stringify([...hidden]));
    return true;
  } catch {
    return false;
  }
}
