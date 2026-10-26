import {
  authoringRoute,
  authoringInput,
} from "../../../../../lib/authoring-server";
export const dynamic = "force-dynamic";
function key(request: Request) {
  return decodeURIComponent(new URL(request.url).pathname.split("/")[4]);
}
export const GET = authoringRoute(async (service, request) =>
  service.detail(key(request)),
);
export const PUT = authoringRoute(async (service, request) => {
  const body = await authoringInput(request);
  return service.save(key(request), body as never, body.source);
});
