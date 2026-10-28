/** Memory-only settings protocol. No identity secret or telemetry belongs in this state. */
export type ComparisonPreference = {
  stealth: boolean;
  age: "adult" | "non-adult" | "unknown";
};
export type PrivacySnapshot = ComparisonPreference & { participant: string };
export type RemotePrivacy = ComparisonPreference & { revision: string };
export type PrivacyReply =
  | { status: "ok"; value: RemotePrivacy | null }
  | { status: "pending"; value?: RemotePrivacy }
  | { status: "conflict" | "deleted" };
export interface PrivacyTransport {
  read(participant: string): Promise<PrivacyReply>;
  update(
    local: PrivacySnapshot,
    expectedRevision: string | null,
  ): Promise<PrivacyReply>;
}
export type PrivacyView = {
  /**
   * unshared: the server has never recorded this browser's comparison settings, so it is not
   * counted. Only a person's own action sends them (saving an age answer or a stealth choice, or
   * the explicit review action); observing, focus and retry never enroll anyone.
   */
  status:
    | "disabled"
    | "pending"
    | "confirmed"
    | "unshared"
    | "conflict"
    | "deleted";
  local?: PrivacySnapshot;
  remote?: RemotePrivacy | null;
};
export const PRIVACY_SAVE = "muscle-memory:comparison-privacy-save";
const matches = (a: ComparisonPreference, b: ComparisonPreference) =>
  a.stealth === b.stealth && a.age === b.age;

export class PrivacyController {
  private generation = 0;
  private view: PrivacyView;
  private baseline: {
    participant: string;
    value: RemotePrivacy | null;
  } | null = null;
  private listeners = new Set<() => void>();
  constructor(
    private transport: PrivacyTransport,
    private enabled = true,
  ) {
    this.view = { status: enabled ? "pending" : "disabled" };
  }
  getSnapshot = () => this.view;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  private publish(view: PrivacyView) {
    this.view = view;
    for (const listener of this.listeners) listener();
  }
  invalidate = (preserveReview = false) => {
    this.generation++;
    if (!preserveReview)
      this.publish({
        status: this.enabled ? "pending" : "disabled",
        local: this.view.local,
      });
  };
  clear = () => {
    this.generation++;
    this.baseline = null;
    this.publish({ status: this.enabled ? "pending" : "disabled" });
  };
  private begin(local: PrivacySnapshot) {
    const generation = ++this.generation;
    if (this.baseline?.participant !== local.participant) this.baseline = null;
    this.publish({ status: this.enabled ? "pending" : "disabled", local });
    return generation;
  }
  private async read(local: PrivacySnapshot, generation: number) {
    let reply: PrivacyReply;
    try {
      reply = await this.transport.read(local.participant);
    } catch {
      reply = { status: "pending" };
    }
    if (generation !== this.generation) return;
    if (reply.status === "ok") {
      this.baseline = { participant: local.participant, value: reply.value };
      this.publish({
        status: !reply.value
          ? "unshared"
          : matches(local, reply.value)
            ? "confirmed"
            : "conflict",
        local,
        remote: reply.value,
      });
    } else if (reply.status === "pending" && reply.value) {
      this.baseline = { participant: local.participant, value: reply.value };
      this.publish({
        status: matches(local, reply.value) ? "pending" : "conflict",
        local,
        remote: reply.value,
      });
    } else
      this.publish({
        status: reply.status === "deleted" ? "deleted" : "pending",
        local,
      });
  }
  async observe(local: PrivacySnapshot) {
    const generation = this.begin(local);
    if (this.enabled) await this.read(local, generation);
  }
  /** Use only the revision already observed, never read-and-blindly-overwrite on a save. */
  async save(local: PrivacySnapshot) {
    const expected =
      this.baseline?.participant === local.participant
        ? (this.baseline.value?.revision ?? null)
        : null;
    const generation = this.begin(local);
    if (!this.enabled) return;
    let reply: PrivacyReply;
    try {
      reply = await this.transport.update(local, expected);
    } catch {
      reply = { status: "pending" };
    }
    if (generation !== this.generation) return;
    if (reply.status === "conflict") {
      await this.read(local, generation);
      return;
    }
    if (reply.status === "ok" && reply.value && matches(local, reply.value)) {
      this.baseline = { participant: local.participant, value: reply.value };
      this.publish({ status: "confirmed", local, remote: reply.value });
    } else
      this.publish({
        status: reply.status === "deleted" ? "deleted" : "pending",
        local,
      });
  }
  async retry(local: PrivacySnapshot) {
    if (this.view.status !== "pending") {
      await this.observe(local);
      return;
    }
    if (
      !this.view.local ||
      this.view.local.participant !== local.participant ||
      !matches(this.view.local, local)
    ) {
      await this.observe(local);
      return;
    }
    await this.save(local);
  }
  /** Explicit review only; a later server mutation still wins through conditional writes. */
  async applyReviewed(local: PrivacySnapshot) {
    if (
      (this.view.status !== "conflict" && this.view.status !== "unshared") ||
      !this.view.local ||
      this.view.local.participant !== local.participant ||
      !matches(this.view.local, local)
    ) {
      await this.observe(local);
      return;
    }
    await this.save(local);
  }
}
