import "server-only";
import { adminRoute } from "./admin-server";
import { authoringService } from "./managed-catalog";
import { AuthoringInvalid } from "../../../packages/authoring/source";
import {
  AuthoringConflict,
  AuthoringUnavailable,
} from "../../../packages/authoring/storage";
import type { AuthoringService } from "../../../packages/authoring/service";

const inputs = new WeakMap<Request, Record<string, unknown>>();
export async function authoringInput(
  request: Request,
): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new AuthoringInvalid("A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    bytes += next.value.byteLength;
    if (bytes > 8 * 1024 * 1024) {
      await reader.cancel();
      throw new AuthoringInvalid("Request exceeds the 8 MiB limit.");
    }
    chunks.push(next.value);
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(joined),
    );
  } catch {
    throw new AuthoringInvalid("Request body is not valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AuthoringInvalid("Request body must be an object.");
  inputs.set(request, value as Record<string, unknown>);
  return value as Record<string, unknown>;
}
export function authoringRoute(
  handler: (service: AuthoringService, request: Request) => Promise<unknown>,
) {
  return adminRoute(async (request) => {
    let service: AuthoringService | null = null;
    try {
      service = await authoringService();
      if (!service)
        throw new AuthoringUnavailable("Authoring storage is not configured.");
      return Response.json(await handler(service, request));
    } catch (error) {
      const status =
        error instanceof AuthoringInvalid
          ? 400
          : error instanceof AuthoringConflict
            ? 409
            : 503;
      const input = inputs.get(request);
      const parts = new URL(request.url).pathname.split("/").filter(Boolean);
      const key =
        parts[3] ??
        (input?.source as { metadata?: { key?: string } } | undefined)?.metadata
          ?.key;
      if (
        service &&
        request.method !== "GET" &&
        key &&
        /^[A-Z]+-[0-9]{3}$/.test(key) &&
        typeof input?.requestId === "string"
      ) {
        try {
          await service.storage.failedAudit(
            input.requestId,
            key,
            parts[4] ?? (request.method === "POST" ? "create" : "edit"),
            status === 400
              ? "validation"
              : status === 409
                ? "conflict"
                : "storage",
            new Date().toISOString(),
          );
        } catch {
          return Response.json(
            {
              error:
                "The operation could not be confirmed and its failure audit is unavailable. Refresh before retrying.",
            },
            { status: 503 },
          );
        }
      }
      return Response.json(
        {
          error:
            error instanceof AuthoringInvalid ||
            error instanceof AuthoringConflict ||
            error instanceof AuthoringUnavailable
              ? error.message
              : "Authoring storage is unavailable. Refresh before retrying.",
          ...(error instanceof AuthoringInvalid && error.problems.length
            ? { problems: error.problems }
            : {}),
        },
        { status },
      );
    }
  });
}
