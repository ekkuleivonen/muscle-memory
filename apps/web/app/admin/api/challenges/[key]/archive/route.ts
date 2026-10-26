import {
  authoringRoute,
  authoringInput,
} from "../../../../../../lib/authoring-server";
export const dynamic = "force-dynamic";
export const POST = authoringRoute(async (service, request) => {
  const body = await authoringInput(request);
  return service.archive(
    decodeURIComponent(new URL(request.url).pathname.split("/")[4]),
    body as never,
  );
});
