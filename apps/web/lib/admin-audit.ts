import { requireAdminMutationOrigin, type AdminIdentity } from "./admin-auth";

export interface OperatorAudit {
  action: "challenge.create" | "challenge.publish" | "challenge.archive";
  challenge: string;
  revision: string;
  at: string;
  result: "started" | "succeeded" | "failed";
}
export interface AuditSink {
  write(record: OperatorAudit): Promise<void>;
}
/**
 * Future mutation primitive, unused until a durable sink and lifecycle are approved.
 * Caller must supply the shared real authorization function, not an identity from client input.
 * A failed initial audit write stops the mutation. Audit failures are never swallowed.
 */
export async function auditedAdminMutation<T>(
  request: Request,
  target: Pick<OperatorAudit, "action" | "challenge" | "revision">,
  authorize: (headers: Headers) => Promise<AdminIdentity>,
  sink: AuditSink,
  mutate: () => Promise<T>,
): Promise<T> {
  await authorize(request.headers);
  requireAdminMutationOrigin(request);
  if (
    !["challenge.create", "challenge.publish", "challenge.archive"].includes(
      target.action,
    ) ||
    !/^([A-Z]+)-[0-9]{3}$/.test(target.challenge) ||
    !/^sha256:[a-f0-9]{64}$/.test(target.revision)
  )
    throw new Error("Invalid audit target");
  const write = (result: OperatorAudit["result"]) =>
    sink.write({
      action: target.action,
      challenge: target.challenge,
      revision: target.revision,
      at: new Date().toISOString(),
      result,
    });
  await write("started");
  let value: T;
  try {
    value = await mutate();
  } catch (error) {
    await write("failed");
    throw error;
  }
  await write("succeeded");
  return value;
}
