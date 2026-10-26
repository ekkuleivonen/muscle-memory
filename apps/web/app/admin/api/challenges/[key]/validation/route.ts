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
      "Client QA transcripts or pass flags are not accepted.",
    );
  return service.requestValidation(
    decodeURIComponent(new URL(request.url).pathname.split("/")[4]),
    body as never,
  );
});
