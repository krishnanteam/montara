import { Timestamp } from "firebase-admin/firestore";

// --- Slack API types ---

export interface SlackEventCallback {
  type: "event_callback";
  token: string;
  team_id: string;
  api_app_id: string;
  event: SlackMessageEvent;
  event_id: string;
  event_time: number;
}

export interface SlackUrlVerification {
  type: "url_verification";
  challenge: string;
  token: string;
}

export type SlackPayload = SlackEventCallback | SlackUrlVerification;

export interface SlackMessageEvent {
  type: string;
  subtype?: string;
  channel: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
  files?: SlackFile[];
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url_private: string;
  url_private_download: string;
}

// --- Firestore document types ---

export interface RawEvent {
  eventId: string;
  payload: SlackEventCallback;
  receivedAt: Timestamp;
}

export interface RawMessage {
  slackMessageTs: string;
  slackChannelId: string;
  slackThreadTs: string | null;
  slackUserId: string;
  userName: string;
  text: string;
  hasImage: boolean;
  imageUrl: string | null;
  imageTranscription: string | null;
  createdAt: Timestamp;
}
