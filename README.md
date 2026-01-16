# Montara

A digital employee portal for real estate professionals. Montara provides access to AI-powered skills for document analysis, property matching, and more.

## Live Site

https://montara-portal.web.app

## Features

- Google Authentication (restricted to authorized domains)
- Digital employee interface with skill cards
- Dark theme UI

## Skills

| Skill | Description | URL |
|-------|-------------|-----|
| **Disclosure AI** | AI-powered real estate disclosure document analysis | https://disclosureai-7362d.web.app |
| **HomeMatch** | Match buyers with sellers using intelligent algorithms | https://homematcher-86e14.web.app |

## Tech Stack

- **Frontend:** React 18 + TypeScript
- **Build:** Vite
- **Styling:** Tailwind CSS
- **Auth:** Firebase Authentication (Google)
- **Hosting:** Firebase Hosting

## Development

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your Firebase config

# Start dev server
npm run dev

# Build for production
npm run build
```

## Deployment

```bash
# Deploy to Firebase Hosting
firebase deploy
```

## Project Structure

```
├── src/
│   ├── components/
│   │   └── SkillCard.tsx    # Skill card component
│   ├── contexts/
│   │   └── AuthContext.tsx  # Authentication context
│   ├── lib/
│   │   └── firebase.ts      # Firebase configuration
│   ├── App.tsx              # Main application
│   ├── main.tsx             # Entry point
│   └── index.css            # Tailwind styles
├── public/
│   └── sg-logo.png          # Logo
├── firebase.json            # Firebase hosting config
├── vite.config.ts           # Vite config
└── tailwind.config.js       # Tailwind config
```
