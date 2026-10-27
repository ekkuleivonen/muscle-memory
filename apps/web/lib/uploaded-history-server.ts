import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  ownerHistory,
  readUploadedHistory,
  HistoryRefusal,
  type HistoryWindow,
  type OwnerVerifier,
} from "../../../packages/developer-profile/uploaded-history";

const recent = new Map<string, number>();
let active = 0;
/** Existing web SQL secret stays here. No credential/config installation in this change. */
export async function uploadedHistory(
  participant: string,
  secret: string,
  window: HistoryWindow,
) {
  const env =
    process.env.NODE_ENV === "development"
      ? {}
      : ((await getCloudflareContext({ async: true })).env as unknown as {
          ADMIN_STATS_SQL_TOKEN?: string;
          PARTICIPANT_OWNER?: OwnerVerifier;
        });
  if (!env.ADMIN_STATS_SQL_TOKEN || !env.PARTICIPANT_OWNER)
    throw new HistoryRefusal(
      503,
      "Uploaded history is not configured yet. Device evidence remains available.",
    );
  const token = env.ADMIN_STATS_SQL_TOKEN;
  return ownerHistory(
    env.PARTICIPANT_OWNER,
    async (participant, window) => {
      const now = Date.now();
      for (const [key, at] of recent) if (now - at >= 60000) recent.delete(key);
      if (recent.has(participant) || active >= 2 || recent.size >= 1024)
        throw new HistoryRefusal(
          429,
          "History reads are limited. Wait a minute before loading another page.",
        );
      recent.set(participant, now);
      active++;
      try {
        return await readUploadedHistory(token, participant, window);
      } finally {
        active--;
      }
    },
    participant,
    secret,
    window,
  );
}
