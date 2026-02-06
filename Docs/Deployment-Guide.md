# Montara Portal: Deployment Guide

> For engineers working on the Montara portal and the OffMarket Bot.
> Last updated: 2026-02-06

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Local Development Setup](#3-local-development-setup)
4. [Project Structure](#4-project-structure)
5. [Build Pipeline](#5-build-pipeline)
6. [Deployment Procedures](#6-deployment-procedures)
7. [Firebase Project Details](#7-firebase-project-details)
8. [Environment Variables](#8-environment-variables)
9. [Authentication](#9-authentication)
10. [Phase 0 Additions (Cloud Functions + Firestore)](#10-phase-0-additions)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Architecture Overview

### Current State

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER                               │
│                                                         │
│  React 18 SPA (TypeScript)                              │
│  ├── Google OAuth via Firebase Auth                     │
│  ├── Skill cards → external Firebase apps               │
│  └── Tailwind CSS dark theme                            │
└───────────────────┬─────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│              FIREBASE HOSTING                            │
│                                                         │
│  Project: montara-portal                                │
│  URL: https://montara-portal.web.app                    │
│  Serves: dist/ (Vite build output)                      │
│  Routing: All paths → index.html (SPA)                  │
└─────────────────────────────────────────────────────────┘
```

### After Phase 0

```
┌──────────────┐     ┌──────────────────────────────────────────┐
│ SLACK         │     │ BROWSER                                  │
│ #offmarket    │     │ React 18 SPA                             │
│ channel       │     │ ├── /           Skills grid              │
│               │     │ └── /offmarket  Raw message feed         │
└──────┬────────┘     └──────────┬──────────────────────────────┘
       │                         │
       ▼                         ▼
┌──────────────────────────────────────────────────────────────┐
│                    FIREBASE                                    │
│                                                              │
│  Hosting ─── dist/ (Vite build)                              │
│  Cloud Functions (2nd Gen) ─── slackEvents, processMessage   │
│  Firestore ─── raw_messages collection                       │
│  Secret Manager ─── SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET,   │
│                     GEMINI_API_KEY                            │
│  Cloud Storage ─── Slack image cache                         │
└──────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React | 18.3.1 |
| Language | TypeScript | 5.6.3 |
| Bundler | Vite | 5.4.11 |
| Styling | Tailwind CSS | 3.4.15 |
| Icons | Lucide React | 0.460.0 |
| Auth | Firebase Auth (Google OAuth) | 12.8.0 |
| Hosting | Firebase Hosting | — |
| Backend (Phase 0+) | Firebase Cloud Functions (2nd Gen) | — |
| Database (Phase 0+) | Cloud Firestore | — |
| AI | Google GenAI SDK | 0.7.0 |

---

## 2. Prerequisites

### Required accounts and access

- [ ] **GitHub**: Push access to `krishnanteam/montara` repository
- [ ] **Firebase**: Editor or Owner role on the `montara-portal` project ([Firebase Console](https://console.firebase.google.com/project/montara-portal))
- [ ] **Google Cloud**: The Firebase project runs on GCP project `montara-portal`

### Required tools

```bash
# Node.js (v18+ required for Cloud Functions 2nd Gen)
node --version   # Should be >= 18.x

# npm
npm --version    # Should be >= 9.x

# Firebase CLI
firebase --version   # Should be >= 13.x
# Install if missing:
npm install -g firebase-tools

# Authenticate Firebase CLI
firebase login
```

### Verify Firebase access

```bash
# Should list montara-portal
firebase projects:list

# Should show hosting config
firebase --project montara-portal apps:list
```

---

## 3. Local Development Setup

### First-time setup

```bash
# 1. Clone the repository
git clone https://github.com/krishnanteam/montara.git portal
cd portal

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env

# 4. Get Firebase config values
firebase --project montara-portal apps:sdkconfig web
# Copy the config values into your .env file
```

### Edit `.env` with real values

```bash
VITE_FIREBASE_API_KEY=<from firebase console>
VITE_FIREBASE_AUTH_DOMAIN=montara-portal.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=montara-portal
VITE_FIREBASE_STORAGE_BUCKET=montara-portal.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=<from firebase console>
VITE_FIREBASE_APP_ID=<from firebase console>
```

All `VITE_` prefixed variables are exposed to the client at build time via `import.meta.env`. These are Firebase public config keys — safe to expose.

### Start development server

```bash
npm run dev
# → http://localhost:3000
```

Vite provides hot module replacement (HMR). Changes to source files are reflected instantly in the browser.

### Login restriction

The app only allows `@ruthkrishnan.com` Google accounts. During development, you need a valid `@ruthkrishnan.com` email to test authenticated views. The domain check is in [src/contexts/AuthContext.tsx](../src/contexts/AuthContext.tsx):

```typescript
const ALLOWED_DOMAIN = 'ruthkrishnan.com'
```

---

## 4. Project Structure

```
portal/
├── .claude/                     # Claude Code settings
│   ├── settings.json            # Shared project settings (committed)
│   └── settings.local.json      # Local settings (gitignored)
├── Docs/                        # Architecture docs & reviews
│   ├── OffMarketBot-PRD.md
│   ├── OffMarketBot-Architecture-Plan.md
│   ├── OffMarketBot-Storage-Design.md
│   └── Reviews/
├── public/                      # Static assets (copied as-is to dist/)
│   └── sg-logo.png
├── src/
│   ├── components/
│   │   └── SkillCard.tsx        # Reusable skill card component
│   ├── contexts/
│   │   └── AuthContext.tsx       # Auth provider with domain restriction
│   ├── lib/
│   │   └── firebase.ts          # Firebase app initialization
│   ├── App.tsx                  # Main app component (skills grid)
│   ├── main.tsx                 # React entry point
│   └── index.css                # Tailwind directives + custom styles
├── .env.example                 # Environment variable template
├── .gitignore
├── firebase.json                # Firebase Hosting config
├── .firebaserc                  # Firebase project alias (montara-portal)
├── index.html                   # HTML entry point
├── package.json
├── postcss.config.js            # PostCSS: Tailwind + Autoprefixer
├── tailwind.config.js           # Tailwind content paths
├── tsconfig.json                # TypeScript config (strict mode)
├── tsconfig.node.json           # TypeScript config for build tools
└── vite.config.ts               # Vite: React plugin, port 3000
```

### What gets deployed

Only the `dist/` directory is deployed to Firebase Hosting. It is generated by `npm run build` and contains:

```
dist/
├── index.html                   # Entry point (all routes rewrite here)
├── assets/
│   ├── index-*.css              # Bundled CSS (~11KB / ~3KB gzipped)
│   └── index-*.js               # Bundled JS (~310KB / ~82KB gzipped)
└── sg-logo.png                  # Copied from public/
```

---

## 5. Build Pipeline

### Build command

```bash
npm run build
```

This runs two steps sequentially:

1. **`tsc`** — TypeScript type checking (no output, `noEmit: true`)
   - Strict mode enabled
   - Unused variables/parameters are errors
   - If any type errors exist, the build fails here

2. **`vite build`** — Production bundle
   - Reads `src/main.tsx` as entry point
   - Processes JSX/TSX via `@vitejs/plugin-react`
   - Processes CSS via PostCSS (Tailwind + Autoprefixer)
   - Tree-shakes unused code
   - Outputs to `dist/`

### Build configuration

| Setting | Value | File |
|---|---|---|
| Target | ES2020 | tsconfig.json |
| Module | ESNext | tsconfig.json |
| JSX | react-jsx | tsconfig.json |
| Strict | true | tsconfig.json |
| Output | dist/ | vite.config.ts (default) |
| CSS | Tailwind 3 + Autoprefixer | postcss.config.js |

### Preview production build locally

```bash
npm run preview
# → http://localhost:4173 (serves dist/ locally)
```

---

## 6. Deployment Procedures

### Standard deployment (hosting only)

```bash
# Build + deploy in one command
npm run deploy
```

This runs `npm run build && firebase deploy`, which:
1. Type-checks TypeScript
2. Bundles with Vite to `dist/`
3. Uploads `dist/` to Firebase Hosting
4. Makes it live at https://montara-portal.web.app

### Manual step-by-step

```bash
# 1. Ensure clean build
npm run build

# 2. Preview locally to verify (optional)
npm run preview

# 3. Deploy to Firebase
firebase deploy

# Or deploy only hosting (faster, skips other services)
firebase deploy --only hosting
```

### Deployment output

A successful deployment looks like:

```
=== Deploying to 'montara-portal'...
i  deploying hosting
i  hosting[montara-portal]: beginning deploy...
i  hosting[montara-portal]: found 4 files in dist
✔  hosting[montara-portal]: file upload complete
✔  hosting[montara-portal]: version finalized
✔  hosting[montara-portal]: release complete

✔  Deploy complete!

Hosting URL: https://montara-portal.web.app
```

### Rollback

Firebase Hosting keeps previous versions. To rollback:

```bash
# List recent deployments
firebase hosting:channel:list

# Or use the Firebase Console:
# → Hosting → Release History → Roll back to a previous version
```

### Git workflow

```bash
# 1. Make changes on a branch
git checkout -b feature/my-feature

# 2. Commit
git add <files>
git commit -m "Description of changes"

# 3. Push and create PR
git push -u origin feature/my-feature
gh pr create --title "My feature" --body "Description"

# 4. After PR merge, deploy from main
git checkout main
git pull
npm run deploy
```

There is no CI/CD pipeline. Deployments are manual. Any engineer with Firebase access can deploy.

---

## 7. Firebase Project Details

| Property | Value |
|---|---|
| Project ID | `montara-portal` |
| Project Number | *(see Firebase Console)* |
| Hosting URL | https://montara-portal.web.app |
| Auth Domain | montara-portal.firebaseapp.com |
| Storage Bucket | montara-portal.appspot.com |
| Region | us-central1 (default) |
| Console | https://console.firebase.google.com/project/montara-portal |

### Firebase services in use

| Service | Status | Purpose |
|---|---|---|
| Hosting | **Active** | Serves the SPA |
| Authentication | **Active** | Google OAuth sign-in |
| Firestore | **Not yet** | Phase 0: raw_messages collection |
| Cloud Functions | **Not yet** | Phase 0: Slack event handler |
| Cloud Storage | **Not yet** | Phase 0: Slack image cache |
| Secret Manager | **Not yet** | Phase 0: Slack tokens, Gemini API key |

### `firebase.json` (current)

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

The `rewrites` rule is critical — it sends all paths to `index.html`, enabling client-side routing (react-router-dom).

### `.firebaserc`

```json
{
  "projects": {
    "default": "montara-portal"
  }
}
```

---

## 8. Environment Variables

### Frontend (Vite)

Stored in `.env` (gitignored). Template in `.env.example`.

| Variable | Required | Description |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Yes | Firebase REST API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Yes | `montara-portal.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Yes | `montara-portal` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Yes | `montara-portal.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Yes | Cloud Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Yes | Firebase app ID |

These are accessed in code via `import.meta.env.VITE_*`. They are **baked into the build** at compile time — not read at runtime. Changing env vars requires a rebuild.

### Backend — Cloud Functions (Phase 0+)

Stored in Firebase Secret Manager. Not in `.env`.

| Secret | Required | Description |
|---|---|---|
| `SLACK_BOT_TOKEN` | Phase 0 | Slack Bot User OAuth Token (`xoxb-...`) |
| `SLACK_SIGNING_SECRET` | Phase 0 | Slack app signing secret for request verification |
| `GEMINI_API_KEY` | Phase 0 | Google Gemini API key for image transcription |

Set via:

```bash
firebase functions:secrets:set SLACK_BOT_TOKEN
firebase functions:secrets:set SLACK_SIGNING_SECRET
firebase functions:secrets:set GEMINI_API_KEY
```

---

## 9. Authentication

### How it works

1. User clicks "Sign in with Google"
2. Firebase `signInWithPopup()` opens Google OAuth dialog
3. On success, `onAuthStateChanged` fires
4. App checks if user's email domain is `ruthkrishnan.com`
5. If unauthorized domain → auto sign-out with "Access Restricted" error
6. If authorized → user state is populated, app renders authenticated view

### Key files

- [src/contexts/AuthContext.tsx](../src/contexts/AuthContext.tsx) — Auth provider, domain check logic
- [src/lib/firebase.ts](../src/lib/firebase.ts) — Firebase init, Google provider export

### Changing the allowed domain

Edit the `ALLOWED_DOMAIN` constant in `AuthContext.tsx`:

```typescript
const ALLOWED_DOMAIN = 'ruthkrishnan.com'  // Change this
```

To allow multiple domains, modify the check in `onAuthStateChanged`:

```typescript
const ALLOWED_DOMAINS = ['ruthkrishnan.com', 'anotherdomain.com']
// ...
if (!ALLOWED_DOMAINS.includes(domain)) { ... }
```

---

## 10. Phase 0 Additions

Phase 0 adds Cloud Functions and Firestore to the project. This section will be expanded as Phase 0 is implemented.

### Initialize Cloud Functions

```bash
# From the portal root directory
firebase init functions

# Select:
# - Language: TypeScript
# - ESLint: Yes
# - Install dependencies: Yes
```

This creates a `functions/` directory with its own `package.json` and `tsconfig.json`.

### Initialize Firestore

```bash
firebase init firestore

# Creates:
# - firestore.rules
# - firestore.indexes.json
```

### Updated `firebase.json` (Phase 0)

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "functions": {
    "source": "functions",
    "runtime": "nodejs20"
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

### Deploying with Cloud Functions

```bash
# Deploy everything (hosting + functions + firestore rules)
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only hosting
firebase deploy --only hosting

# Deploy only firestore rules
firebase deploy --only firestore:rules
```

### New project structure (Phase 0)

```
portal/
├── functions/                    ◀ NEW
│   ├── src/
│   │   ├── index.ts              # Function exports
│   │   ├── slack/
│   │   │   ├── events.ts         # Slack event handler
│   │   │   ├── verify.ts         # Signature verification
│   │   │   └── types.ts          # Slack API types
│   │   ├── llm/
│   │   │   └── image.ts          # Gemini multimodal OCR
│   │   └── utils/
│   │       ├── firestore.ts      # DB helpers
│   │       └── slack-client.ts   # Slack Web API wrapper
│   ├── package.json
│   └── tsconfig.json
├── firestore.rules               ◀ NEW
├── firestore.indexes.json        ◀ NEW
├── src/                          (existing frontend)
│   ├── pages/                    ◀ NEW
│   │   └── offmarket/
│   │       └── Feed.tsx          # Raw message feed page
│   └── ...
└── ...
```

---

## 11. Troubleshooting

### Build fails on TypeScript errors

```bash
# Run tsc directly to see all errors
npx tsc --noEmit
```

Common causes:
- Unused variables/parameters (strict mode)
- Missing type annotations
- Import path errors

### `firebase deploy` fails with permission error

```bash
# Re-authenticate
firebase login --reauth

# Verify project access
firebase projects:list
```

### Blank page after deployment

1. Check browser console for errors
2. Verify `.env` values match the Firebase project
3. Ensure `firebase.json` has the SPA rewrite rule
4. Check that `dist/index.html` exists after build

### Auth not working

1. Verify Google sign-in is enabled in Firebase Console → Authentication → Sign-in method
2. Check that the hosting URL is in the authorized domains list (Firebase Console → Authentication → Settings → Authorized domains)
3. Verify `VITE_FIREBASE_AUTH_DOMAIN` matches

### Local dev server won't start

```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill the process or change the port in vite.config.ts
```

### Cloud Functions logs (Phase 0+)

```bash
# View recent function logs
firebase functions:log

# Stream logs in real-time
firebase functions:log --follow

# View in GCP Console
# → https://console.cloud.google.com/logs?project=montara-portal
```
