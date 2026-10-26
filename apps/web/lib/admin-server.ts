import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import {
  adminConfig,
  authorizeAdmin,
  AdminDenied,
  requireAdminMutationOrigin,
  ADMIN_HEADERS,
} from "./admin-auth";

async function configuration() {
  // Local Next dev uses the same real verifier and deployment-shaped config, no bypass.
  const env =
    process.env.NODE_ENV === "development"
      ? process.env
      : (await getCloudflareContext({ async: true })).env;
  return adminConfig(env as unknown as Record<string, unknown>);
}
export async function requireAdmin(headersValue?: Headers) {
  return authorizeAdmin(
    headersValue ?? new Headers(await headers()),
    await configuration(),
  );
}

/** Every admin handler performs its own check; a layout/middleware is not a data boundary. */
export function adminRoute(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      if (new URL(request.url).origin !== "https://musclememory.run")
        throw new AdminDenied();
      await requireAdmin(request.headers);
      if (!["GET", "HEAD"].includes(request.method))
        requireAdminMutationOrigin(request);
    } catch {
      return new Response("Operator access required.", {
        status: 403,
        headers: ADMIN_HEADERS,
      });
    }
    try {
      const response = await handler(request);
      for (const [key, value] of Object.entries(ADMIN_HEADERS))
        response.headers.set(key, value);
      return response;
    } catch {
      return new Response("Admin data is unavailable.", {
        status: 503,
        headers: ADMIN_HEADERS,
      });
    }
  };
}
