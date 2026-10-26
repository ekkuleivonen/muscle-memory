import {
  authoringRoute,
  authoringInput,
} from "../../../../../../lib/authoring-server";
import { AuthoringInvalid } from "../../../../../../../../packages/authoring/source";
export const dynamic = "force-dynamic";
export const POST = authoringRoute(async (service, request) => {
  const body = await authoringInput(request);
  if (
    Object.keys(body).some(
      (k) => !["requestId", "expectedGeneration"].includes(k),
    )
  )
    throw new AuthoringInvalid(
      "Start checks for the saved draft before submitting browser results.",
    );
  return service.beginValidation(
    decodeURIComponent(new URL(request.url).pathname.split("/")[4]),
    body as never,
  );
});
