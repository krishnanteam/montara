import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "../utils/firestore";
import {
  getSlackClient,
  resolveUserName,
  downloadSlackFile,
} from "../utils/slack-client";
import { transcribeImage } from "../llm/image";
import type { RawEvent, SlackMessageEvent } from "../slack/types";

const slackBotToken = defineSecret("SLACK_BOT_TOKEN");
const geminiApiKey = defineSecret("GEMINI_API_KEY");

/** Slack message subtypes we ignore (system/join/leave messages). */
const IGNORED_SUBTYPES = [
  "channel_join",
  "channel_leave",
  "channel_topic",
  "channel_purpose",
  "channel_name",
];

/**
 * Firestore onCreate trigger on raw_events/{eventId}.
 * Processes each Slack event asynchronously:
 *   1. Filters out bot/system messages
 *   2. Resolves Slack user ID → display name
 *   3. Downloads and OCR-transcribes images (if any)
 *   4. Writes the processed RawMessage to raw_messages collection
 */
export const processRawEvent = onDocumentCreated(
  {
    document: "raw_events/{eventId}",
    secrets: [slackBotToken, geminiApiKey],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const rawEvent = snap.data() as RawEvent;
    const msg = rawEvent.payload.event as SlackMessageEvent;

    // Skip bot messages
    if (msg.bot_id || msg.subtype === "bot_message") {
      return;
    }

    // Only process regular messages
    if (msg.type !== "message") {
      return;
    }

    // Skip system subtypes
    if (msg.subtype && IGNORED_SUBTYPES.includes(msg.subtype)) {
      return;
    }

    const slack = getSlackClient(slackBotToken.value());

    // Resolve user display name
    const userName = msg.user
      ? await resolveUserName(slack, msg.user)
      : "Unknown";

    // Process images
    let hasImage = false;
    let imageUrl: string | null = null;
    let imageTranscription: string | null = null;

    if (msg.files && msg.files.length > 0) {
      const imageFile = msg.files.find((f) =>
        f.mimetype.startsWith("image/")
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
          console.error("Image transcription failed:", err);
          imageTranscription = "[Image transcription failed]";
        }
      }
    }

    // Write processed message to raw_messages (keyed by Slack ts for dedup)
    await db
      .collection("raw_messages")
      .doc(msg.ts)
      .set({
        slackMessageTs: msg.ts,
        slackChannelId: msg.channel,
        slackThreadTs: msg.thread_ts ?? null,
        slackUserId: msg.user ?? "",
        userName,
        text: msg.text ?? "",
        hasImage,
        imageUrl,
        imageTranscription,
        createdAt: FieldValue.serverTimestamp(),
      });
  }
);
