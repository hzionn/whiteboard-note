# Project Context: whiteboard-note (Whiteboard Note App)

Agents Instructions: You are a senior SWE, you should take balance between extensibiliy, readability, simplicity, scalability, security for future proof.
I can imagine there will be huge of AI features plan to add to our note and whiteboard.

## 1. Brief Project Overview (may outdate over time)

This project is a web-based, Markdown-centric note-taking application inspired by Obsidian and Heptabase. It features a spatial whiteboard interface where notes can be organized visually, combined with a robust "WYSIWYG-like" Markdown editor and AI-powered writing assistance using Google Gemini.

### Key Technologies

- **Frontend**: React 19 (TypeScript)
- **Build System**: Next.js (App Router)
- **Styling**: Tailwind CSS (Custom "Obsidian" theme)
- **Editor**: CodeMirror 6 (`@uiw/react-codemirror`)
- **AI Integration**: Google GenAI SDK (`@google/genai`)
- **Icons**: Lucide React
- **Math Rendering**: KaTeX

## 2. Architecture & Structure

The project follows a feature-based directory structure:

- `src/app/`: Contains the main application component (`App.tsx`) which orchestrates global state (boards, notes, frames) and persistence.
- `src/features/`: Isolated feature modules.
  - `boards/`: Sidebar and board management.
  - `whiteboard/`: The spatial canvas component.
  - `editor/`: The CodeMirror-based markdown editor.
  - `ai/`: Gemini API integration services.
- `src/shared/`: Shared utilities, types, and persistence logic (`localStorage` wrappers).
- `src/styles/`: Global styles and Tailwind configuration.

### Data Model

- **Persistence**: All data is saved to `localStorage` (no backend database).
- **State Management**: React `useState`/`useReducer` lifted to `App.tsx` and synchronized with storage via effects.
- **Entities**:
  - `Note`: Markdown content, ID, position.
  - `WhiteboardItem`: wrapper for positioning notes on the canvas.
  - `Frame`: Grouping container for notes.
  - `Board`: Independent collection of notes and items.

## 3. Building and Running

### Prerequisites

- Node.js (LTS)
- Google Gemini API Key

### Setup

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Configure Environment**:
   Create `.env.local` and add your API key:

   ```env
   VITE_GEMINI_API_KEY=your_api_key_here
   ```

### Scripts

- `npm run dev`: Start development server (default: `http://localhost:5173`).
- `npm run build`: Build for production.
- `npm run preview`: Preview production build.

## 4. Development Conventions

### Styling

- Use the custom Tailwind colors defined in `tailwind.config.cjs` for consistency:
  - `bg-obsidian-bg`, `bg-obsidian-sidebar`
  - `text-obsidian-text`, `text-obsidian-muted`
  - `border-obsidian-border`
  - `text-obsidian-accent` (Purple)

### Editor Development

- The editor is built on CodeMirror 6. Custom behavior (like live preview of Markdown syntax) is implemented via CodeMirror plugins/extensions.
- Ensure plugins are memoized in React components to avoid re-initialization performance issues.

### AI Features

- AI logic resides in `src/features/ai/services/geminiService.ts`.
- Prompts should use "System Instructions" to define the AI's persona as a helpful writing assistant.

### Git & Version Control

- Follow standard git practices.
- Commit messages should be clear and descriptive.
