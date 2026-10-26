import {
  authoringRoute,
  authoringInput,
} from "../../../../lib/authoring-server";
import { AuthoringInvalid } from "../../../../../../packages/authoring/source";
export const dynamic = "force-dynamic";
export const GET = authoringRoute(async (service) => ({
  items: await service.list(),
}));
export const POST = authoringRoute(async (service, request) => {
  const body = await authoringInput(request);
  const key = (body.source as { metadata?: { key?: unknown } } | undefined)
    ?.metadata?.key;
  if (typeof key !== "string") throw new AuthoringInvalid("Missing source key");
  return service.save(key, body as never, body.source, true);
});
