import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { FieldValue } from "firebase-admin/firestore";
import { verifySlackSignature } from "./verify";
import { db } from "../utils/firestore";
import type { SlackEventCallback, SlackUrlVerification } from "./types";

const slackSigningSecret = defineSecret("SLACK_SIGNING_SECRET");

/**
 * HTTP endpoint that receives Slack Events API callbacks.
 * Verifies the request signature, acks immediately, and writes the raw event
 * to Firestore for async processing by the processRawEvent trigger.
 */
export const slackEvents = onRequest(
  { secrets: [slackSigningSecret] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    // Verify Slack signature
    const signature = req.headers["x-slack-signature"] as string;
    const timestamp = req.headers["x-slack-request-timestamp"] as string;
    if (!signature || !timestamp) {
      res.status(401).send("Missing signature headers");
      return;
    }

    if (
      !verifySlackSignature(
        slackSigningSecret.value(),
        signature,
        timestamp,
        req.rawBody.toString("utf8")
      )
    ) {
      res.status(401).send("Invalid signature");
      return;
    }

    const body = req.body;

    // Handle Slack URL verification challenge
    if (body.type === "url_verification") {
      const { challenge } = body as SlackUrlVerification;
      res.status(200).json({ challenge });
      return;
    }

    // Handle event callbacks
    if (body.type === "event_callback") {
      const event = body as SlackEventCallback;

      // Write raw event to Firestore — use create() for idempotent dedup.
      // If the event already exists (Slack retry), create() throws ALREADY_EXISTS.
      try {
        await db.collection("raw_events").doc(event.event_id).create({
          eventId: event.event_id,
          payload: event,
          receivedAt: FieldValue.serverTimestamp(),
        });
      } catch (err: unknown) {
        const code = (err as { code?: number }).code;
        if (code === 6) {
          // ALREADY_EXISTS — Slack retry, event already queued
          res.status(200).send();
          return;
        }
        console.error("Failed to write raw event:", err);
        res.status(500).send("Internal error");
        return;
      }

      res.status(200).send();
      return;
    }

    res.status(400).send("Unknown event type");
  }
);
