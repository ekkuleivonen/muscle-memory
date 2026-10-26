import {
  authoringRoute,
  authoringInput,
} from "../../../../../../../lib/authoring-server";
import { AuthoringInvalid } from "../../../../../../../../../packages/authoring/source";
export const dynamic = "force-dynamic";
/** The authenticated sole operator submits browser evidence; this is not independent proof. */
export const POST = authoringRoute(async (service, request) => {
  const body = await authoringInput(request);
  if (
    Object.keys(body).some(
      (k) => !["requestId", "expectedGeneration", "runs"].includes(k),
    )
  )
    throw new AuthoringInvalid(
      "Submit the actual browser run results, not a pass flag.",
    );
  const parts = new URL(request.url).pathname.split("/");
  return service.finishValidation(
    decodeURIComponent(parts[4]),
    decodeURIComponent(parts[6]),
    body as never,
    body.runs,
  );
});
