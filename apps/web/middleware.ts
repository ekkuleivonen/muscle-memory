import { NextResponse, type NextRequest } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  adminConfig,
  authorizeAdmin,
  isAdminPath,
  requireAdminMutationOrigin,
  ADMIN_HEADERS,
} from "./lib/admin-auth";

/** Edge middleware is supported by the pinned OpenNext adapter. Handlers also verify directly. */
export async function middleware(request: NextRequest) {
  try {
    if (!isAdminPath(request.nextUrl.pathname)) return NextResponse.next();
    if (request.nextUrl.origin !== "https://musclememory.run")
      throw new Error("host");
    const env =
      process.env.NODE_ENV === "development"
        ? process.env
        : (await getCloudflareContext({ async: true })).env;
    await authorizeAdmin(
      request.headers,
      adminConfig(env as unknown as Record<string, unknown>),
    );
    if (!["GET", "HEAD"].includes(request.method))
      requireAdminMutationOrigin(request);
    const response = NextResponse.next();
    for (const [key, value] of Object.entries(ADMIN_HEADERS))
      response.headers.set(key, value);
    return response;
  } catch {
    return new NextResponse("Operator access required.", {
      status: 403,
      headers: ADMIN_HEADERS,
    });
  }
}
// All paths are classified so encoded aliases cannot skip an admin-only matcher.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
