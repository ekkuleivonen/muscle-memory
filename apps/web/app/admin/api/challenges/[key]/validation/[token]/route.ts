import { authoringRoute } from "../../../../../../../lib/authoring-server";
import { AuthoringInvalid } from "../../../../../../../../../packages/authoring/source";
export const dynamic = "force-dynamic";
/** No client callback can create a trusted QA receipt, even with a valid operator session. */
export const POST = authoringRoute(async () => {
  throw new AuthoringInvalid(
    "Client-supplied QA transcripts are not accepted. Start trusted validation.",
  );
});
