/**
 * This page load's session id, shared by every stream recording during it: one random id per
 * load, kept in memory only, so a reload starts a new session and nothing links sessions but the
 * participant.
 */
import { randomId } from "./random-id";

export const PAGE_SESSION_ID = `session-${randomId()}`;
