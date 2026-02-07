# Montara

A digital employee portal for real estate professionals. Montara provides access to AI-powered skills for document analysis, property matching, and off-market intelligence.

## Live Site

https://montara-portal.web.app

## Features

- Google Authentication (restricted to `@ruthkrishnan.com` domain)
- Digital employee interface with skill cards
- **OffMarket Intel** — captures off-market property intel from Slack with image OCR
- Real-time feed with search, thread grouping, and image transcriptions
- Dark theme UI

## Skills

| Skill | Description | Type |
|-------|-------------|------|
| **Disclosure AI** | AI-powered real estate disclosure document analysis | External |
| **HomeMatch** | Match buyers with sellers using intelligent algorithms | External |
| **OffMarket Intel** | Browse off-market property intel from Slack | Internal (`/offmarket`) |

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Routing:** react-router-dom
- **Backend:** Firebase Cloud Functions (2nd Gen, Node.js 20)
- **Database:** Cloud Firestore
- **LLM:** Google Gemini API (`@google/genai`) — image OCR
- **Integrations:** Slack Events API (`@slack/web-api`)
- **Auth:** Firebase Authentication (Google OAuth)
- **Hosting:** Firebase Hosting
- **Secrets:** Google Cloud Secret Manager

## Architecture

```
Slack #offmarket channel
       │
       ▼
slackEvents (HTTP Cloud Function)
  → Verify signature, ack 200
  → Write to raw_events collection
       │
       ▼ (Firestore onCreate trigger)
processRawEvent
  → Resolve Slack user name
  → Download images, OCR via Gemini
  → Write to raw_messages collection
       │
       ▼
Portal /offmarket (real-time Firestore listener)
```

## Development

```bash
# Install dependencies
npm install
cd functions && npm install && cd ..

# Start dev server (frontend)
npm run dev

# Build everything
npm run build
cd functions && npm run build && cd ..

# Deploy all (hosting + functions + firestore rules)
firebase deploy
```

## Environment & Secrets

**Frontend** (`.env` file):
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, etc.

**Cloud Functions** (Firebase Secret Manager):
- `SLACK_BOT_TOKEN` — Slack bot OAuth token
- `SLACK_SIGNING_SECRET` — Slack app signing secret
- `GEMINI_API_KEY` — Google Gemini API key

Set secrets with: `firebase functions:secrets:set SECRET_NAME`

## Project Structure

```
├── src/                          # Frontend (React SPA)
│   ├── components/
│   │   └── SkillCard.tsx         # Skill card (internal + external links)
│   ├── contexts/
│   │   └── AuthContext.tsx       # Google OAuth context
│   ├── lib/
│   │   └── firebase.ts          # Firebase client (Auth + Firestore)
│   ├── pages/
│   │   └── offmarket/
│   │       └── Feed.tsx          # OffMarket real-time feed page
│   ├── App.tsx                   # Routes + layout
│   ├── main.tsx                  # Entry point with BrowserRouter
│   └── index.css                 # Tailwind styles
├── functions/                    # Cloud Functions (backend)
│   └── src/
│       ├── index.ts              # Function exports
│       ├── slack/
│       │   ├── events.ts         # Slack event HTTP handler
│       │   ├── verify.ts         # HMAC-SHA256 signature verification
│       │   └── types.ts          # Slack + Firestore type definitions
│       ├── processing/
│       │   ├── messages.ts       # Firestore onCreate trigger (async processor)
│       │   └── backfill.ts       # Slack history backfill function
│       ├── llm/
│       │   └── image.ts          # Gemini multimodal OCR
│       └── utils/
│           ├── firestore.ts      # Firebase Admin init
│           └── slack-client.ts   # Slack API wrapper
├── Docs/                         # Architecture docs & reviews
├── firestore.rules               # Firestore security rules
├── firestore.indexes.json        # Firestore composite indexes
├── firebase.json                 # Firebase project config
└── CLAUDE.md                     # Cross-session context for engineers
```

## Backfill Slack History

To import historical messages:

```bash
curl -X POST https://us-central1-montara-portal.cloudfunctions.net/backfillHistory \
  -H "Content-Type: application/json" \
  -H "X-Backfill-Secret: <SLACK_SIGNING_SECRET>" \
  -d '{"channelId": "<CHANNEL_ID>", "oldest": "<UNIX_TIMESTAMP>"}'
```
