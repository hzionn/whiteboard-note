# Project Context: whiteboard-note (Whiteboard Note App)

Agent instructions: you are a senior SWE. Balance extensibility, readability, simplicity, scalability, and security.
Remember to follow the project folder structure and conventions.
This codebase is expected to grow (especially AI features), so prefer clear module boundaries and stable APIs.

## 1) High-level overview

whiteboard-note is a web-based, Markdown-centric note-taking app with a spatial whiteboard canvas.
It combines a CodeMirror 6 editor (styled to feel “document/WYSIWYG-like”) with an AI writing assistant powered by Gemini via a Next.js API route.

Key stack:

- Next.js (App Router) + React 19 + TypeScript
- Tailwind CSS (custom “Obsidian” theme tokens)
- CodeMirror 6 via `@uiw/react-codemirror`
- KaTeX for math rendering
- `@google/genai` on the server (API route)

## 2) Repository tree (authoritative)

This is the current, trimmed tree of the repo focusing on source and key configs:

```text
.
├── AGENTS.md
├── README.md
├── metadata.json
├── next.config.ts
├── next-env.d.ts
├── package.json
├── package-lock.json
├── postcss.config.cjs
├── tailwind.config.cjs
├── tsconfig.json
├── .env.example
├── .env.local                # local-only; not committed
├── src
│   ├── app                   # Next.js App Router
│   │   ├── layout.tsx         # global styles/fonts, wraps the app
│   │   ├── page.tsx           # route entry; renders <App />
│   │   ├── App.tsx            # client app shell + state orchestration
│   │   └── api
│   │       ├── health
│   │       │   └── route.ts   # GET /api/health
│   │       └── ai
│   │           └── action
│   │               └── route.ts # POST /api/ai/action (Gemini)
│   ├── features              # product features (UI + feature logic)
│   │   ├── ai
│   │   │   └── services
│   │   │       └── geminiService.ts # client helper calling /api/ai/action
│   │   ├── boards
│   │   │   └── components
│   │   │       └── Sidebar.tsx
│   │   ├── editor
│   │   │   └── components
│   │   │       └── Editor.tsx
│   │   ├── whiteboard
│   │   │   └── components
│   │   │       └── Whiteboard.tsx
│   │   ├── auth              # placeholder (currently .gitkeep)
│   │   ├── settings          # placeholder (currently .gitkeep)
│   │   └── sync              # placeholder (currently .gitkeep)
│   ├── shared                # cross-cutting code shared by features
│   │   ├── types.ts           # core domain types (Note/Frame/Board/etc)
│   │   ├── persistence
│   │   │   └── storage.ts     # localStorage persistence + migrations
│   │   ├── api               # placeholder (.gitkeep)
│   │   ├── config            # placeholder (.gitkeep)
│   │   ├── lib               # placeholder (.gitkeep)
│   │   ├── observability     # placeholder (.gitkeep)
│   │   ├── types             # placeholder (empty dir)
│   │   └── ui                # placeholder (.gitkeep)
│   └── styles
│       └── index.css         # Tailwind base + global styles
└── (generated)
    ├── node_modules/
    └── .next/
```

## 3) “What goes where” (no ambiguity)

### `src/app/` (Next.js runtime + routing)

- Use for **routes**, **layouts**, and anything that must live in App Router.
- `src/app/page.tsx` is the entry route and renders `src/app/App.tsx`.
- `src/app/App.tsx` is the client-side orchestration layer (state + persistence wiring).
- `src/app/api/**/route.ts` contains **server** handlers.

Rule of thumb:

- If it’s a **URL route** or **server handler**, it belongs under `src/app/`.
- If it’s **feature UI/logic**, it belongs under `src/features/`.

### `src/app/api/` (server routes)

- `src/app/api/health/route.ts`: simple health check.
- `src/app/api/ai/action/route.ts`: Gemini “action” endpoint.
  - Reads `process.env.GEMINI_API_KEY` (server-side)
  - Accepts `{ type: 'continue'|'summarize'|'improve', prompt?, context? }`
  - Performs input clamping and returns `{ requestId, text }`

### `src/features/` (feature modules)

Each folder here is a “vertical slice”: UI components + feature-specific logic.

- `features/whiteboard/`: the canvas / spatial interactions (pan/zoom, drag, resize, frames).
- `features/editor/`: CodeMirror-based Markdown editor, including math, task list widgets, link behaviors, and AI trigger UI.
- `features/boards/`: board list/sidebar UI.
- `features/ai/`: client-side helpers for calling AI endpoints.
- `features/auth`, `features/settings`, `features/sync`: currently placeholders (`.gitkeep`).
  - Keep them empty until the feature is real; don’t “park” random utilities here.

### `src/shared/` (shared, cross-feature code)

This is for code that is **not specific to a single feature**.

- `shared/types.ts`: the domain model (`Note`, `WhiteboardItem`, `Frame`, `WhiteboardBoard`).
- `shared/persistence/storage.ts`: localStorage persistence layer.
  - Board-scoped storage keys
  - Migration from legacy single-board keys
  - CRUD helpers for boards/notes/items/frames

Placeholder folders under `shared/`:

- `shared/api/`: shared API client helpers (if/when we add more endpoints).
- `shared/config/`: shared config and env parsing.
- `shared/lib/`: general utilities.
- `shared/observability/`: logging/metrics/tracing abstractions.
- `shared/ui/`: shared UI primitives/components.
- `shared/types/`: reserved for type expansions if `types.ts` becomes too large.

If a folder only has `.gitkeep`, treat it as “reserved but empty”.

### `src/styles/`

- Global CSS and Tailwind entrypoint. Imported by `src/app/layout.tsx`.

## 4) Data model & persistence

- Persistence is currently **browser localStorage** (no backend DB).
- “Boards” exist and data is stored under **board-scoped keys**.
- The persistence layer performs a best-effort migration from legacy single-board keys.

Core entities:

- `Note`: markdown content + metadata
- `WhiteboardItem`: positioning/sizing wrapper for a `Note` on the canvas
- `Frame`: container region used for grouping notes
- `WhiteboardBoard`: independent workspace

## 5) Build & run

Prereqs:

- Node.js (LTS)
- Gemini API key

Env:

- Create `.env.local` with:

  ```env
  GEMINI_API_KEY=your_api_key_here
  ```

Scripts:

- `npm run dev` → Next dev server at `http://localhost:3000`
- `npm run build` → production build
- `npm run start` → serve production build at `http://localhost:3000`
- `npm run format` / `npm run format:check` → Prettier

## 6) Development conventions

Styling:

- Use Tailwind theme tokens from `tailwind.config.cjs` (avoid hard-coded new colors).

Editor:

- CodeMirror extensions/plugins should be memoized to avoid re-init churn.

AI:

- Client calls `/api/ai/action` via `features/ai/services/geminiService.ts`.
- Keep server logs free of user content (the API route already follows this pattern).

Git:

- Keep commits small and descriptive.
