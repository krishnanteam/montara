# Montara Portal

## Project Overview

A digital employee portal for a real estate team (Ruth Krishnan's team). Provides access to AI-powered skills and will host the OffMarket Bot — a collective intelligence system for off-market real estate intel.

**Live:** https://montara-portal.web.app
**Firebase project:** `montara-portal`
**Repo:** `krishnanteam/montara`

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Auth:** Firebase Auth (Google OAuth, restricted to `@ruthkrishnan.com`)
- **Hosting:** Firebase Hosting (serves `dist/`)
- **Backend (Phase 0+):** Firebase Cloud Functions (2nd Gen, Node.js 20)
- **Database (Phase 0+):** Cloud Firestore
- **AI:** Google GenAI SDK (`@google/genai`)

## Project Structure

```
portal/
├── src/                         # React frontend
│   ├── components/              # Reusable components (SkillCard)
│   ├── contexts/                # AuthContext (Google OAuth + domain check)
│   ├── lib/                     # Firebase initialization
│   ├── App.tsx                  # Main app (skills grid)
│   └── main.tsx                 # Entry point
├── functions/                   # Cloud Functions (Phase 0+)
├── Docs/                        # Architecture docs
│   ├── OffMarketBot-PRD.md
│   ├── OffMarketBot-Architecture-Plan.md
│   ├── OffMarketBot-Storage-Design.md
│   ├── Deployment-Guide.md
│   └── Reviews/                 # Architecture review docs
├── firebase.json                # Firebase config (hosting, functions, firestore)
├── .firebaserc                  # Firebase project alias → montara-portal
├── firestore.rules              # Firestore security rules (Phase 0+)
└── firestore.indexes.json       # Firestore composite indexes (Phase 0+)
```

## Development

```bash
npm install              # Install deps
cp .env.example .env     # Setup env (get values from Firebase console)
npm run dev              # Dev server on http://localhost:3000
npm run build            # TypeScript check + Vite build → dist/
npm run deploy           # Build + firebase deploy
```

## Deployment

- **Hosting:** `firebase deploy --only hosting` (deploys `dist/`)
- **Functions:** `firebase deploy --only functions` (deploys `functions/`)
- **Firestore rules:** `firebase deploy --only firestore:rules`
- **Everything:** `firebase deploy` or `npm run deploy`
- **No CI/CD** — deployments are manual from any engineer's machine
- See [Docs/Deployment-Guide.md](Docs/Deployment-Guide.md) for full procedures

## Environment Variables

**Frontend** (in `.env`, gitignored): `VITE_FIREBASE_*` — baked into build at compile time.

**Backend** (Firebase Secret Manager):
- `SLACK_BOT_TOKEN` — Slack Bot OAuth token
- `SLACK_SIGNING_SECRET` — Slack request verification
- `GEMINI_API_KEY` — Google Gemini API key

## Authentication

Google OAuth only. Domain-restricted to `@ruthkrishnan.com` in `src/contexts/AuthContext.tsx`. Firestore security rules also enforce this domain via `request.auth.token.email`.

## OffMarket Bot

A Slack-integrated bot that captures off-market real estate intel from the team's #offmarket Slack channel. Architecture uses an event-sourced property model.

**Current phase:** Phase 0 (Raw Capture) — capture Slack messages verbatim + image OCR into Firestore.

**Phases:**
- Phase 0: Raw capture + image transcription + backfill Slack history
- Phase 1: LLM entity extraction + property model + merge engine
- Phase 2: Thread enrichment + unmatched contribution resolution
- Phase 3: Natural language querying via Slack
- Phase 4: Portal dashboard with property browser
- Phase 5: Refinement (embeddings, full-text search, analytics)

See [Docs/OffMarketBot-Architecture-Plan.md](Docs/OffMarketBot-Architecture-Plan.md) for full details.

## Key Conventions

- Strict TypeScript (`noUnusedLocals`, `noUnusedParameters`)
- Dark theme UI (Tailwind slate palette)
- All Firestore writes go through Cloud Functions (Admin SDK). Frontend is read-only.
- Slack is the primary input channel. Portal is a secondary dashboard.
