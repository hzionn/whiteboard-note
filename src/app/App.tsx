'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Sidebar } from '@/features/boards/components/Sidebar';
import { Whiteboard } from '@/features/whiteboard/components/Whiteboard';
import {
  ensureBoardsInitialized,
  getBoards,
  saveBoards,
  setActiveBoardId,
  createBoard,
  renameBoard,
  deleteBoardData,
  getNotes,
  saveNotes,
  createNote,
  updateNoteInStorage,
  deleteNoteFromStorage,
  getWhiteboardItems,
  saveWhiteboardItems,
  createWhiteboardItemForNote,
  batchUpsertWhiteboardItems,
  deleteWhiteboardItemsByNoteId,
  getFrames,
  saveFrames,
  createFrame,
} from '@/shared/persistence/storage';
import {
  AppTheme,
  getSidebarOpenPreference,
  getThemePreference,
  setSidebarOpenPreference,
  setThemePreference,
} from '@/shared/persistence/uiPrefs';
import { Frame, Note, WhiteboardBoard, WhiteboardItem } from '@/shared/types';
import { v4 as uuidv4 } from 'uuid';
import { GripVertical, Menu } from 'lucide-react';

const createWelcomeNote = (): Note => ({
  id: uuidv4(),
  title: 'Welcome to whiteboard-note',
  content: `# Welcome to whiteboard-note

This is a **true WYSIWYG** markdown editor experiment.

## Features
- **Live Preview**: The editor uses CodeMirror 6 to provide a robust, styled writing experience that feels like a real document.
- **AI Powered**: Use the sparkle icon in the top right to continue your thoughts, summarize, or fix grammar using Gemini.
- **Auto-save**: Your notes are saved to your browser's local storage automatically.

## Typography
You can write headers, *italics*, **bold**, lists, and more.

> "The scariest moment is always just before you start."

- [ ] Task 1
- [ ] Task 2

\`\`\`javascript
console.log("Hello World");
\`\`\`
    `,
  updatedAt: Date.now(),
  frameId: null,
});

const App: React.FC = () => {
  const [boards, setBoards] = useState<WhiteboardBoard[]>([]);
  const [activeBoardId, setActiveBoardIdState] = useState<string | null>(null);

  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  // IMPORTANT: Don't read localStorage during initial render.
  // This component is pre-rendered on the server; reading prefs client-side in
  // the initial state initializer can cause hydration mismatches.
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<AppTheme>('dark');
  const [whiteboardItems, setWhiteboardItems] = useState<WhiteboardItem[]>([]);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [centerOnRequest, setCenterOnRequest] = useState<{ noteId: string; nonce: number } | null>(
    null
  );
  const [centerOnFrameRequest, setCenterOnFrameRequest] = useState<{
    frameId: string;
    nonce: number;
  } | null>(null);
  const [isNotesDropdownOpen, setIsNotesDropdownOpen] = useState(false);
  const [notesSearch, setNotesSearch] = useState('');
  const notesDropdownRef = useRef<HTMLDivElement>(null);
  const notesSearchInputRef = useRef<HTMLInputElement>(null);

  const [dragNoteId, setDragNoteId] = useState<string | null>(null);

  const [isFramesDropdownOpen, setIsFramesDropdownOpen] = useState(false);
  const [framesSearch, setFramesSearch] = useState('');
  const framesDropdownRef = useRef<HTMLDivElement>(null);
  const framesSearchInputRef = useRef<HTMLInputElement>(null);

  const pendingWhiteboardSavesRef = React.useRef<Map<string, WhiteboardItem>>(new Map());
  const whiteboardSaveTimerRef = React.useRef<number | null>(null);
  const activeBoardIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeBoardIdRef.current = activeBoardId;
  }, [activeBoardId]);

  useEffect(() => {
    if (!hasHydrated) return;
    setSidebarOpenPreference(isSidebarOpen);
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!hasHydrated) return;
    setThemePreference(theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    setHasHydrated(true);
    const persistedTheme = getThemePreference();
    setTheme(persistedTheme);
    document.documentElement.dataset.theme = persistedTheme;

    const persistedSidebar = getSidebarOpenPreference();
    setIsSidebarOpen(persistedSidebar);
  }, []);

  const flushWhiteboardSaves = useCallback(() => {
    if (whiteboardSaveTimerRef.current != null) {
      window.clearTimeout(whiteboardSaveTimerRef.current);
      whiteboardSaveTimerRef.current = null;
    }
    const boardId = activeBoardIdRef.current;
    if (!boardId) {
      pendingWhiteboardSavesRef.current.clear();
      return;
    }
    const pending = Array.from(pendingWhiteboardSavesRef.current.values());
    pendingWhiteboardSavesRef.current.clear();
    batchUpsertWhiteboardItems(boardId, pending);
  }, []);

  const scheduleWhiteboardSave = useCallback(
    (item: WhiteboardItem) => {
      pendingWhiteboardSavesRef.current.set(item.id, item);
      if (whiteboardSaveTimerRef.current != null) return;
      whiteboardSaveTimerRef.current = window.setTimeout(flushWhiteboardSaves, 250);
    },
    [flushWhiteboardSaves]
  );

  const loadBoardData = useCallback((boardId: string) => {
    const storedNotes = getNotes(boardId);
    const storedFrames = getFrames(boardId);
    const storedItems = getWhiteboardItems(boardId);

    // First board on a fresh install gets a welcome note.
    if (storedNotes.length === 0) {
      const welcome = createWelcomeNote();
      const nextNotes = [welcome];
      saveNotes(boardId, nextNotes);
      const nextItems = [createWhiteboardItemForNote(welcome.id, 120, 120)];
      saveWhiteboardItems(boardId, nextItems);
      setNotes(nextNotes);
      setActiveNoteId(null);
      setFrames(storedFrames);
      setWhiteboardItems(nextItems);
      return;
    }

    setNotes(storedNotes);
    setFrames(storedFrames);

    if (storedItems.length > 0) {
      setWhiteboardItems(storedItems);
    } else {
      const initialItems = storedNotes.map((note, idx) =>
        createWhiteboardItemForNote(note.id, 80 + (idx % 4) * 40, 80 + idx * 40)
      );
      setWhiteboardItems(initialItems);
      saveWhiteboardItems(boardId, initialItems);
    }

    setActiveNoteId(null);
  }, []);

  useEffect(() => {
    const { boards: initialBoards, activeBoardId: initialActive } = ensureBoardsInitialized({
      defaultBoardName: 'Main Whiteboard',
    });
    setBoards(initialBoards);
    setActiveBoardIdState(initialActive);
    loadBoardData(initialActive);
  }, [loadBoardData]);

  useEffect(() => {
    if (!activeBoardId) return;
    loadBoardData(activeBoardId);
  }, [activeBoardId, loadBoardData]);

  useEffect(() => {
    // Best-effort: persist any pending whiteboard item updates when the tab is
    // hidden or the page is unloaded. localStorage writes are synchronous.
    const onBeforeUnload = () => {
      flushWhiteboardSaves();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') flushWhiteboardSaves();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [flushWhiteboardSaves]);

  const activeNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) ?? null,
    [notes, activeNoteId]
  );

  const filteredNotes = useMemo(() => {
    const query = notesSearch.trim().toLowerCase();
    if (!query) return notes;
    return notes.filter(
      (n) =>
        (n.title ?? '').toLowerCase().includes(query) ||
        (n.content ?? '').toLowerCase().includes(query)
    );
  }, [notes, notesSearch]);

  const filteredFrames = useMemo(() => {
    const query = framesSearch.trim().toLowerCase();
    if (!query) return frames;
    return frames.filter((f) => (f.name ?? '').toLowerCase().includes(query));
  }, [frames, framesSearch]);

  const jumpToNote = useCallback((noteId: string) => {
    setActiveNoteId(noteId);
    setCenterOnRequest({ noteId, nonce: Date.now() });
  }, []);

  const reorderNotes = useCallback((draggedNoteId: string, targetNoteId: string) => {
    if (!activeBoardIdRef.current) return;
    if (draggedNoteId === targetNoteId) return;
    const boardId = activeBoardIdRef.current;

    setNotes((prev) => {
      const fromIndex = prev.findIndex((n) => n.id === draggedNoteId);
      const toIndex = prev.findIndex((n) => n.id === targetNoteId);
      if (fromIndex < 0 || toIndex < 0) return prev;

      const next = prev.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      saveNotes(boardId, next);
      return next;
    });
  }, []);

  const handleCreateNoteAt = (x: number, y: number) => {
    if (!activeBoardId) return;
    const newNote = createNote();
    const updatedNotes = [newNote, ...notes];
    setNotes(updatedNotes);
    saveNotes(activeBoardId, updatedNotes);
    setActiveNoteId(newNote.id);

    setWhiteboardItems((prev) => {
      const item = createWhiteboardItemForNote(newNote.id, x, y);
      const next = [...prev, item];
      saveWhiteboardItems(activeBoardId, next);
      return next;
    });

    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleCreateFrame = () => {
    if (!activeBoardId) return;
    // Minimal, deterministic placement (can be refined later to use viewport center).
    const idx = frames.length;
    const x = 120 + (idx % 3) * 40;
    const y = 120 + idx * 40;
    const frame = createFrame(x, y);
    setFrames((prev) => {
      const next = [...prev, frame];
      saveFrames(activeBoardId, next);
      return next;
    });

    setCenterOnFrameRequest({ frameId: frame.id, nonce: Date.now() });
    setIsFramesDropdownOpen(false);
    setFramesSearch('');
  };

  useEffect(() => {
    if (!isNotesDropdownOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const root = notesDropdownRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setIsNotesDropdownOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [isNotesDropdownOpen]);

  useEffect(() => {
    if (!isFramesDropdownOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const root = framesDropdownRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setIsFramesDropdownOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [isFramesDropdownOpen]);

  useEffect(() => {
    if (!isNotesDropdownOpen) return;
    // Focus after the dropdown content mounts.
    const id = window.setTimeout(() => {
      notesSearchInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [isNotesDropdownOpen]);

  useEffect(() => {
    if (!isFramesDropdownOpen) return;
    const id = window.setTimeout(() => {
      framesSearchInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [isFramesDropdownOpen]);

  const deleteNoteById = useCallback(
    (id: string) => {
      if (!activeBoardIdRef.current) return;
      if (!window.confirm('Are you sure you want to delete this note?')) return;
      const boardId = activeBoardIdRef.current;

      setNotes((prev) => {
        const updatedNotes = prev.filter((n) => n.id !== id);
        deleteNoteFromStorage(boardId, id);
        if (activeNoteId === id) {
          setActiveNoteId(updatedNotes.length > 0 ? updatedNotes[0].id : null);
        }
        return updatedNotes;
      });

      deleteWhiteboardItemsByNoteId(boardId, id);
      setWhiteboardItems((prev) => prev.filter((i) => i.noteId !== id));
    },
    [activeNoteId]
  );

  const handleDeleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteNoteById(id);
  };

  const handleUpdateNoteContent = useCallback((noteId: string, content: string) => {
    if (!activeBoardIdRef.current) return;
    const boardId = activeBoardIdRef.current;
    setNotes((prevNotes) => {
      const next = prevNotes.map((note) => {
        if (note.id === noteId) {
          const updated = { ...note, content, updatedAt: Date.now() };
          updateNoteInStorage(boardId, updated);
          return updated;
        }
        return note;
      });
      return next;
    });
  }, []);

  const handleUpdateNoteTitle = useCallback((noteId: string, title: string) => {
    if (!activeBoardIdRef.current) return;
    const boardId = activeBoardIdRef.current;
    setNotes((prevNotes) => {
      const next = prevNotes.map((note) => {
        if (note.id === noteId) {
          const updated = { ...note, title, updatedAt: Date.now() };
          updateNoteInStorage(boardId, updated);
          return updated;
        }
        return note;
      });
      return next;
    });
  }, []);


  const handleAssignNoteToFrame = useCallback((noteId: string, frameId: string | null) => {
    if (!activeBoardIdRef.current) return;
    const boardId = activeBoardIdRef.current;
    setNotes((prevNotes) => {
      const next = prevNotes.map((note) => {
        if (note.id !== noteId) return note;
        if ((note.frameId ?? null) === frameId) return note;
        const updated: Note = { ...note, frameId, updatedAt: Date.now() };
        updateNoteInStorage(boardId, updated);
        return updated;
      });
      return next;
    });
  }, []);

  const handleUpdateFrame = useCallback((updatedFrame: Frame) => {
    if (!activeBoardIdRef.current) return;
    const boardId = activeBoardIdRef.current;
    setFrames((prev) => {
      const idx = prev.findIndex((f) => f.id === updatedFrame.id);
      const next =
        idx >= 0
          ? prev.map((f) => (f.id === updatedFrame.id ? updatedFrame : f))
          : [...prev, updatedFrame];
      saveFrames(boardId, next);
      return next;
    });
  }, []);

  const handleUpdateWhiteboardItem = useCallback(
    (item: WhiteboardItem) => {
      setWhiteboardItems((prev) => {
        const index = prev.findIndex((i) => i.id === item.id);
        const next = index >= 0 ? prev.map((i) => (i.id === item.id ? item : i)) : [...prev, item];
        scheduleWhiteboardSave(item);
        return next;
      });
    },
    [scheduleWhiteboardSave]
  );

  return (
    <div className="flex h-screen overflow-hidden bg-obsidian-bg text-obsidian-text font-sans">
      <Sidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((v) => !v)}
        boards={boards}
        activeBoardId={activeBoardId}
        onCreateBoard={() => {
          flushWhiteboardSaves();
          const existing = getBoards();
          const idx = existing.length + 1;
          const board = createBoard(`Whiteboard ${idx}`);
          const nextBoards = [board, ...existing];
          saveBoards(nextBoards);
          setBoards(nextBoards);
          setActiveBoardId(board.id);
          setActiveBoardIdState(board.id);
          // New boards start empty.
          saveNotes(board.id, []);
          saveFrames(board.id, []);
          saveWhiteboardItems(board.id, []);
          if (window.innerWidth < 768) setIsSidebarOpen(false);
        }}
        onSelectBoard={(boardId) => {
          if (boardId === activeBoardId) {
            if (window.innerWidth < 768) setIsSidebarOpen(false);
            return;
          }
          flushWhiteboardSaves();
          setActiveBoardId(boardId);
          setActiveBoardIdState(boardId);
          if (window.innerWidth < 768) setIsSidebarOpen(false);
        }}
        onRenameBoard={(boardId, name) => {
          const nextBoards = renameBoard(boardId, name);
          setBoards(nextBoards);
        }}
        onDeleteBoard={(boardId) => {
          const board = boards.find((b) => b.id === boardId);
          const label = board?.name?.trim() ? board.name.trim() : 'this whiteboard';
          if (!window.confirm(`Delete ${label}? This will delete its notes and layout.`)) return;

          // Remove persisted data first (best-effort).
          deleteBoardData(boardId);

          const nextBoards = boards.filter((b) => b.id !== boardId);

          // If we deleted the active board, switch to another (or recreate a default).
          if (activeBoardId === boardId) {
            flushWhiteboardSaves();
          }

          if (nextBoards.length === 0) {
            const fallback = createBoard('Main Whiteboard');
            saveBoards([fallback]);
            setBoards([fallback]);
            setActiveBoardId(fallback.id);
            setActiveBoardIdState(fallback.id);
            saveNotes(fallback.id, []);
            saveFrames(fallback.id, []);
            saveWhiteboardItems(fallback.id, []);
            if (window.innerWidth < 768) setIsSidebarOpen(false);
            return;
          }

          saveBoards(nextBoards);
          setBoards(nextBoards);

          if (activeBoardId === boardId) {
            const nextActive = nextBoards[0].id;
            setActiveBoardId(nextActive);
            setActiveBoardIdState(nextActive);
          }

          if (window.innerWidth < 768) setIsSidebarOpen(false);
        }}
      />

      <main className="flex-1 h-full relative flex flex-col min-w-0">
        {/* Top Notes Dropdown */}
        <div className="shrink-0 border-b border-obsidian-border bg-obsidian-sidebar/60 backdrop-blur px-4 py-2 flex items-center justify-between relative z-20">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSidebarOpen((v) => !v)}
              className="p-2 rounded bg-obsidian-bg hover:bg-obsidian-active text-obsidian-text border border-obsidian-border"
              title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              aria-label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              <Menu size={16} />
            </button>

            <div className="flex items-center gap-2" ref={notesDropdownRef}>
              <button
                onClick={() => setIsNotesDropdownOpen((v) => !v)}
                className="px-3 py-1.5 rounded bg-obsidian-bg hover:bg-obsidian-active text-sm text-obsidian-text border border-obsidian-border"
                title="Notes"
              >
                {activeNote ? activeNote.title : 'Select a note'}
              </button>

              {isNotesDropdownOpen && (
                <div className="absolute top-full left-4 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-obsidian-sidebar border border-obsidian-border rounded-md shadow-xl overflow-hidden z-30">
                  {notes.length === 0 ? (
                    <div className="p-3 text-sm text-obsidian-muted">
                      No notes yet. Double-click the board to create one.
                    </div>
                  ) : (
                    <>
                      <div className="p-2 border-b border-obsidian-border">
                        <input
                          ref={notesSearchInputRef}
                          value={notesSearch}
                          onChange={(e) => setNotesSearch(e.target.value)}
                          placeholder="Search notes..."
                          className="w-full bg-obsidian-bg text-sm text-obsidian-text placeholder-obsidian-muted px-3 py-2 rounded border border-transparent focus:border-obsidian-accent focus:outline-none transition-all"
                        />
                      </div>
                      <ul className="max-h-80 overflow-auto">
                        {filteredNotes.length === 0 ? (
                          <li className="p-3 text-sm text-obsidian-muted">No matching notes.</li>
                        ) : (
                          filteredNotes.map((note) => (
                            <li key={note.id}>
                              <div
                                className={
                                  'w-full px-3 py-2 text-sm flex items-center justify-between gap-3 ' +
                                  (note.id === activeNoteId
                                    ? 'bg-obsidian-active text-obsidian-text'
                                    : 'text-obsidian-text hover:bg-obsidian-bg')
                                }
                                draggable={notesSearch.trim() === ''}
                                onDragStart={(e) => {
                                  if (notesSearch.trim() !== '') return;
                                  setDragNoteId(note.id);
                                  e.dataTransfer.effectAllowed = 'move';
                                  try {
                                    e.dataTransfer.setData('text/plain', note.id);
                                  } catch {
                                    // ignore
                                  }
                                }}
                                onDragEnd={() => {
                                  setDragNoteId(null);
                                }}
                                onDragOver={(e) => {
                                  if (notesSearch.trim() !== '') return;
                                  if (!dragNoteId) return;
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = 'move';
                                }}
                                onDrop={(e) => {
                                  if (notesSearch.trim() !== '') return;
                                  e.preventDefault();
                                  const from = dragNoteId || e.dataTransfer.getData('text/plain');
                                  if (!from) return;
                                  reorderNotes(from, note.id);
                                  setDragNoteId(null);
                                }}
                              >
                                <button
                                  onClick={() => {
                                    jumpToNote(note.id);
                                    setIsNotesDropdownOpen(false);
                                    setNotesSearch('');
                                  }}
                                  className="min-w-0 flex-1 text-left"
                                  title={note.title || 'Untitled'}
                                >
                                  <span className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="shrink-0 h-6 min-w-6 px-2 rounded-full border border-obsidian-border bg-obsidian-bg text-xs text-obsidian-text"
                                      title="Note order"
                                    >
                                      {notes.findIndex((n) => n.id === note.id) + 1}
                                    </span>
                                    <span className="truncate block">{note.title || 'Untitled'}</span>
                                  </span>
                                </button>

                                <span
                                  className={
                                    'shrink-0 text-obsidian-muted ' +
                                    (notesSearch.trim() === '' ? 'cursor-grab' : 'opacity-40')
                                  }
                                  title={
                                    notesSearch.trim() === ''
                                      ? 'Drag to reorder'
                                      : 'Clear search to reorder'
                                  }
                                  aria-hidden="true"
                                >
                                  <GripVertical size={16} />
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteNote(note.id, e);
                                  }}
                                  className="shrink-0 text-xs text-obsidian-muted hover:text-red-400"
                                  title="Delete"
                                >
                                  Delete
                                </button>
                              </div>
                            </li>
                          ))
                        )}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2" ref={framesDropdownRef}>
              <button
                onClick={() => setIsFramesDropdownOpen((v) => !v)}
                className="px-3 py-1.5 rounded bg-obsidian-bg hover:bg-obsidian-active text-sm text-obsidian-text border border-obsidian-border"
                title="Frames"
              >
                Frames
              </button>

              {isFramesDropdownOpen && (
                <div className="absolute top-full left-4 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-obsidian-sidebar border border-obsidian-border rounded-md shadow-xl overflow-hidden z-30">
                  <div className="p-2 border-b border-obsidian-border flex items-center gap-2">
                    <input
                      ref={framesSearchInputRef}
                      value={framesSearch}
                      onChange={(e) => setFramesSearch(e.target.value)}
                      placeholder="Search frames..."
                      className="flex-1 bg-obsidian-bg text-sm text-obsidian-text placeholder-obsidian-muted px-3 py-2 rounded border border-transparent focus:border-obsidian-accent focus:outline-none transition-all"
                    />
                    <button
                      onClick={handleCreateFrame}
                      className="px-3 py-2 rounded bg-obsidian-bg hover:bg-obsidian-active text-sm text-obsidian-text border border-obsidian-border"
                      title="New frame"
                    >
                      New
                    </button>
                  </div>
                  <ul className="max-h-80 overflow-auto">
                    {filteredFrames.length === 0 ? (
                      <li className="p-3 text-sm text-obsidian-muted">No matching frames.</li>
                    ) : (
                      filteredFrames.map((frame) => (
                        <li key={frame.id}>
                          <button
                            onClick={() => {
                              setCenterOnFrameRequest({ frameId: frame.id, nonce: Date.now() });
                              setIsFramesDropdownOpen(false);
                              setFramesSearch('');
                            }}
                            className="w-full px-3 py-2 text-sm text-left text-obsidian-text hover:bg-obsidian-bg"
                            title={frame.name || 'Untitled Frame'}
                          >
                            <span className="truncate block">{frame.name || 'Untitled Frame'}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className="px-3 py-1.5 rounded bg-obsidian-bg hover:bg-obsidian-active text-sm text-obsidian-text border border-obsidian-border"
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? 'Dark' : 'Light'}
            </button>
            <div className="text-xs text-obsidian-muted">Double-click the board to create a note</div>
          </div>
        </div>

        <Whiteboard
          notes={notes}
          items={whiteboardItems}
          frames={frames}
          activeNoteId={activeNoteId}
          onActivateNote={(id) => setActiveNoteId(id)}
          onJumpToNote={jumpToNote}
          onCreateNoteAt={handleCreateNoteAt}
          onUpdateItem={handleUpdateWhiteboardItem}
          onUpdateNoteContent={handleUpdateNoteContent}
          onUpdateNoteTitle={handleUpdateNoteTitle}
          onAssignNoteToFrame={handleAssignNoteToFrame}
          onUpdateFrame={handleUpdateFrame}
          onDeleteNote={deleteNoteById}
          centerOnRequest={centerOnRequest ?? undefined}
          centerOnFrameRequest={centerOnFrameRequest ?? undefined}
        />
      </main>
    </div>
  );
};

export default App;
