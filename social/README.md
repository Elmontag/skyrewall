# SkyreWall — Social Creator

A standalone BlueSky post-image builder for SkyreWall. Create branded social cards and post them directly to BlueSky — independent of the main SkyreWall app and its Docker deployment.

## Features

- **4 formats**: Square (1080×1080), Landscape (1200×675), Story (1080×1920), Banner (1200×630)
- **4 templates**: Dark, Light, Gradient, Feature
- **Image upload**: Drag & drop or click to select; optional image attachment to post
- **Live preview**: Scaled canvas preview with real-time text editing
- **PNG export**: Download the card as a high-resolution PNG (2× retina)
- **Bluesky posting**: Post directly via AT Protocol using an app-password; optionally attach the canvas as an image
- **Credential persistence**: Handle and app-password saved locally in `config.json` (never sent to external services beyond BlueSky)

## Setup

```bash
npm install
npm start
# → http://localhost:3334
```

Development (auto-restart on file changes, Node.js 18+):

```bash
npm run dev
```

## Security

- Credentials are stored in `config.json` (local file, git-ignored)
- The server acts as an AT Protocol proxy — credentials are sent **only** to `bsky.social`
- No external analytics, no tracking

## Requirements

- Node.js 18+ (uses built-in `fetch`)
- Internet access to `bsky.social` for posting

## Relationship to SkyreWall

This tool lives in `social/` and is **not** part of the main SkyreWall Docker deployment. It runs on port `3334` (default) to avoid conflicts with the main app.
