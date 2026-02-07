import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../utils/firestore";
import {
  getSlackClient,
  resolveUserName,
  downloadSlackFile,
} from "../utils/slack-client";
import { transcribeImage } from "../llm/image";
import type { SlackFile } from "../slack/types";

const slackBotToken = defineSecret("SLACK_BOT_TOKEN");
const slackSigningSecret = defineSecret("SLACK_SIGNING_SECRET");
const geminiApiKey = defineSecret("GEMINI_API_KEY");

/** Subtypes to skip during backfill. */
const IGNORED_SUBTYPES = [
  "channel_join",
  "channel_leave",
  "channel_topic",
  "channel_purpose",
  "channel_name",
  "bot_message",
];

/**
 * HTTP-triggered function to backfill Slack channel history into raw_messages.
 *
 * POST body:
 *   { "channelId": "C0123...", "oldest"?: "unix_ts", "latest"?: "unix_ts" }
 *
 * Protected by a shared secret header:
 *   X-Backfill-Secret: <SLACK_SIGNING_SECRET value>
 *
 * This is a one-time-use function for seeding 3-6 months of history.
 */
export const backfillHistory = onRequest(
  {
    secrets: [slackBotToken, slackSigningSecret, geminiApiKey],
    timeoutSeconds: 540, // 9 minutes
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // Auth: require shared secret header
    const secret = req.headers["x-backfill-secret"] as string;
    if (secret !== slackSigningSecret.value()) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { channelId, oldest, latest } = req.body;
    if (!channelId) {
      res.status(400).json({ error: "channelId is required" });
      return;
    }

    const slack = getSlackClient(slackBotToken.value());
    let cursor: string | undefined;
    let totalProcessed = 0;
    let totalSkipped = 0;

    try {
      do {
        const result = await slack.conversations.history({
          channel: channelId,
          oldest: oldest || undefined,
          latest: latest || undefined,
          limit: 100,
          cursor,
        });

        if (!result.messages) break;

        for (const msg of result.messages) {
          // Skip bots and system messages
          if (
            msg.bot_id ||
            (msg.subtype && IGNORED_SUBTYPES.includes(msg.subtype))
          ) {
            totalSkipped++;
            continue;
          }

          // Skip if already backfilled
          const existing = await db
            .collection("raw_messages")
            .doc(msg.ts!)
            .get();
          if (existing.exists) {
            totalSkipped++;
            continue;
          }

          // Resolve user name
          const userName = msg.user
            ? await resolveUserName(slack, msg.user)
            : "Unknown";

          // Process images
          let hasImage = false;
          let imageUrl: string | null = null;
          let imageTranscription: string | null = null;

          const files = msg.files as SlackFile[] | undefined;
          if (files && files.length > 0) {
            const imageFile = files.find((f) =>
              f.mimetype?.startsWith("image/")
            );

            if (imageFile) {
              hasImage = true;
              imageUrl = imageFile.url_private;

              try {
                const imageBuffer = await downloadSlackFile(
                  slackBotToken.value(),
                  imageFile.url_private_download
                );
                imageTranscription = await transcribeImage(
                  geminiApiKey.value(),
                  imageBuffer,
                  imageFile.mimetype
                );
              } catch (err) {
                console.error("Backfill image processing failed:", err);
                imageTranscription = "[Image transcription failed]";
              }
            }
          }

          await db
            .collection("raw_messages")
            .doc(msg.ts!)
            .set({
              slackMessageTs: msg.ts!,
              slackChannelId: channelId,
              slackThreadTs: msg.thread_ts ?? null,
              slackUserId: msg.user ?? "",
              userName,
              text: msg.text ?? "",
              hasImage,
              imageUrl,
              imageTranscription,
              createdAt: FieldValue.serverTimestamp(),
            });

          totalProcessed++;
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor);

      res.status(200).json({
        success: true,
        totalProcessed,
        totalSkipped,
      });
    } catch (err) {
      console.error("Backfill failed:", err);
      res.status(500).json({ error: "Backfill failed", details: String(err) });
    }
  }
);
