# whiteboard-note

A web-based, Markdown-centric note-taking app that blends a document-like editor with a spatial whiteboard canvas. It includes an AI writing assistant backed by Gemini, all within a Next.js App Router setup.

## Features

- **Markdown editor + live preview** (CodeMirror 6) with math rendering.
- **Spatial whiteboard** for placing and organizing notes on a canvas.
- **AI writing actions** (continue, summarize, improve) via a Next.js API route.
- **Local-first persistence** using browser `localStorage`.

## Tech Stack

- Next.js (App Router) + React 19 + TypeScript
- Tailwind CSS (custom theme tokens)
- CodeMirror 6 (`@uiw/react-codemirror`)
- KaTeX
- Gemini via `@google/genai`

## Getting Started

### Prerequisites

- Node.js LTS
- A Gemini API key

### Setup

```bash
npm install
```

Create `.env.local` based on `.env.example` and add your API key:

```env
GEMINI_API_KEY=your_api_key_here
```

### Run

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

## Scripts

- `npm run dev` — start the Next.js dev server
- `npm run build` — build for production
- `npm run start` — run the production server
- `npm run format` / `npm run format:check` — Prettier formatting

## Project Structure (high-level)

- `src/app/` — Next.js routes, layouts, and API handlers
- `src/features/` — feature modules (editor, whiteboard, boards, AI)
- `src/shared/` — shared types and persistence layer
- `src/styles/` — global styles
