# Obsidian Clone (Whiteboard Note App)

Agents Instructions: You are a senior SWE, you should take balance between extensibiliy, readability, scalability for future proof.
I can imagine there will be huge of AI features plan to add to our note and whiteboard.

## Brief Project Overview (may outdate over time)

This project is a web-based, Markdown-centric note-taking application inspired by Obsidian, featuring a **whiteboard interface** and **AI-powered assistance**. It combines a robust text editor with a spatial canvas, allowing users to organize notes visually.

### Key Features

* **Whiteboard Canvas**: A spatial interface where notes (as cards) and frames (groups) can be positioned, resized, and organized. Supports panning (Space+Drag) and zooming (Cmd/Ctrl+Scroll).
* **Live Preview Editor**: Built on **CodeMirror 6**, the editor provides a "WYSIWYG-like" experience for Markdown. Syntax markers (e.g., `**bold**`, `# Heading`) are hidden unless the cursor is nearby, and elements like Math (KaTeX) and checkboxes are rendered interactively.
* **AI Integration**: Integrated **Google Gemini API** (`@google/genai`) to assist with writing. Features include "Continue Writing," "Summarize," and "Fix Grammar/Tone."
* **Local Persistence**: All data (boards, notes, frames, whiteboard layout) is saved automatically to the browser's `localStorage`.
* **Multi-Board Support**: Users can create and switch between multiple independent whiteboards.

### Technology Stack

* **Framework**: React 18
* **Build Tool**: Vite
* **Language**: TypeScript
* **Styling**: Tailwind CSS
* **Editor**: CodeMirror 6 (`@uiw/react-codemirror`, `@codemirror/view`, etc.)
* **Icons**: Lucide React
* **Math Rendering**: KaTeX
* **AI Client**: Google GenAI SDK

## Building and Running

### Prerequisites

* Node.js (LTS recommended)
* A Google Gemini API Key

### Setup

1. **Install Dependencies**:

    ```bash
    npm install
    ```

2. **Environment Configuration**:
    Create a `.env.local` file in the root directory and add your Gemini API key:

    ```env
    VITE_GEMINI_API_KEY=your_api_key_here
    ```

### Available Scripts

* **`npm run dev`**: Starts the development server (default port 3000).
* **`npm run build`**: Builds the application for production.
* **`npm run preview`**: Previews the production build locally.

## Project Structure

* **`src/`** (implied root or flat structure):
  * **`App.tsx`**: Main application controller. Manages global state (boards, notes, active selection) and layout.
  * **`components/`**:
    * **`Whiteboard.tsx`**: The infinite canvas component. Handles pointer events for dragging, resizing, and panning. Renders `Editor` instances within note cards.
    * **`Editor.tsx`**: The CodeMirror wrapper. Contains the logic for "Live Preview," AI integration, and editor theming.
    * **`Sidebar.tsx`**: Navigation menu for managing boards.
  * **`services/`**:
    * **`storage.ts`**: Handles CRUD operations against `localStorage`.
    * **`geminiService.ts`**: Interface for the Google Gemini API.
  * **`types.ts`**: TypeScript definitions for `Note`, `WhiteboardItem`, `Frame`, etc.

## Development Conventions

* **State Management**: The app relies primarily on React's local state (`useState`, `useReducer`) lifted to `App.tsx` for coordination, synchronized with `localStorage` via side effects (`useEffect`).
* **Styling**: Custom Tailwind colors are used extensively (e.g., `bg-obsidian-bg`, `text-obsidian-text`). Ensure new components utilize these semantic tokens for theme consistency.
* **Editor Plugins**: CodeMirror extensions (like `livePreviewPlugin` in `Editor.tsx`) are used to implement custom rendering behavior. When modifying the editor, ensure plugins are memoized or stable to prevent re-initialization loops.
* **AI Prompts**: Prompts for Gemini are constructed in `services/geminiService.ts`. System instructions are used to define the AI's persona as a helpful writing assistant.
