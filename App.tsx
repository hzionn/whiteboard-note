import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Whiteboard } from './components/Whiteboard';
import {
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
} from './services/storage';
import { Note, WhiteboardItem } from './types';
import { v4 as uuidv4 } from 'uuid';

// Initial check for data
const initialNotes = getNotes();
if (initialNotes.length === 0) {
  const welcomeNote: Note = {
    id: uuidv4(),
    title: 'Welcome to Obsidian Clone',
    content: `# Welcome to Obsidian Clone

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
    updatedAt: Date.now()
  };
  saveNotes([welcomeNote]);
}

const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [whiteboardItems, setWhiteboardItems] = useState<WhiteboardItem[]>([]);
  const [centerOnRequest, setCenterOnRequest] = useState<{ noteId: string; nonce: number } | null>(null);
  const [isNotesDropdownOpen, setIsNotesDropdownOpen] = useState(false);
  const [notesSearch, setNotesSearch] = useState('');
  const notesDropdownRef = useRef<HTMLDivElement>(null);
  const notesSearchInputRef = useRef<HTMLInputElement>(null);

  const pendingWhiteboardSavesRef = React.useRef<Map<string, WhiteboardItem>>(new Map());
  const whiteboardSaveTimerRef = React.useRef<number | null>(null);

  const flushWhiteboardSaves = useCallback(() => {
    const pending = Array.from(pendingWhiteboardSavesRef.current.values());
    pendingWhiteboardSavesRef.current.clear();
    whiteboardSaveTimerRef.current = null;
    batchUpsertWhiteboardItems(pending);
  }, []);

  const scheduleWhiteboardSave = useCallback((item: WhiteboardItem) => {
    pendingWhiteboardSavesRef.current.set(item.id, item);
    if (whiteboardSaveTimerRef.current != null) return;
    whiteboardSaveTimerRef.current = window.setTimeout(flushWhiteboardSaves, 250);
  }, [flushWhiteboardSaves]);

  useEffect(() => {
    setNotes(getNotes());
    const storedNotes = getNotes();
    if (storedNotes.length > 0 && !activeNoteId) {
        setActiveNoteId(storedNotes[0].id);
    }

    const storedItems = getWhiteboardItems();
    if (storedItems.length > 0) {
      setWhiteboardItems(storedItems);
    } else {
      const initialItems = storedNotes.map((note, idx) =>
        createWhiteboardItemForNote(note.id, 80 + (idx % 4) * 40, 80 + idx * 40)
      );
      setWhiteboardItems(initialItems);
      saveWhiteboardItems(initialItems);
    }
  }, []);

  const activeNote = useMemo(() => notes.find(n => n.id === activeNoteId) ?? null, [notes, activeNoteId]);

  const filteredNotes = useMemo(() => {
    const query = notesSearch.trim().toLowerCase();
    if (!query) return notes;
    return notes.filter(n =>
      (n.title ?? '').toLowerCase().includes(query) ||
      (n.content ?? '').toLowerCase().includes(query)
    );
  }, [notes, notesSearch]);

  const handleCreateNoteAt = (x: number, y: number) => {
    const newNote = createNote();
    const updatedNotes = [newNote, ...notes];
    setNotes(updatedNotes);
    saveNotes(updatedNotes);
    setActiveNoteId(newNote.id);

    setWhiteboardItems(prev => {
      const item = createWhiteboardItemForNote(newNote.id, x, y);
      const next = [...prev, item];
      saveWhiteboardItems(next);
      return next;
    });

    if (window.innerWidth < 768) setIsSidebarOpen(false);
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
    if (!isNotesDropdownOpen) return;
    // Focus after the dropdown content mounts.
    const id = window.setTimeout(() => {
      notesSearchInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(id);
  }, [isNotesDropdownOpen]);

  const handleDeleteNote = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this note?')) {
        const updatedNotes = notes.filter(n => n.id !== id);
        setNotes(updatedNotes);
        deleteNoteFromStorage(id);
        deleteWhiteboardItemsByNoteId(id);
        setWhiteboardItems(prev => prev.filter(i => i.noteId !== id));
        if (activeNoteId === id) {
            setActiveNoteId(updatedNotes.length > 0 ? updatedNotes[0].id : null);
        }
    }
  };

  const handleUpdateNoteContent = useCallback((noteId: string, content: string) => {
    setNotes(prevNotes => {
      const next = prevNotes.map(note => {
        if (note.id === noteId) {
          const updated = { ...note, content, updatedAt: Date.now() };
          updateNoteInStorage(updated);
          return updated;
        }
        return note;
      });
      return next;
    });
  }, []);

  const handleUpdateNoteTitle = useCallback((noteId: string, title: string) => {
    setNotes(prevNotes => {
      const next = prevNotes.map(note => {
        if (note.id === noteId) {
          const updated = { ...note, title, updatedAt: Date.now() };
          updateNoteInStorage(updated);
          return updated;
        }
        return note;
      });
      return next;
    });
  }, []);

  const handleUpdateWhiteboardItem = useCallback((item: WhiteboardItem) => {
    setWhiteboardItems(prev => {
      const index = prev.findIndex(i => i.id === item.id);
      const next = index >= 0 ? prev.map(i => (i.id === item.id ? item : i)) : [...prev, item];
      scheduleWhiteboardSave(item);
      return next;
    });
  }, [scheduleWhiteboardSave]);

  return (
    <div className="flex h-screen overflow-hidden bg-obsidian-bg text-obsidian-text font-sans">
      <Sidebar 
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      <main className="flex-1 h-full relative flex flex-col min-w-0">
        {!isSidebarOpen && (
             <button 
             onClick={() => setIsSidebarOpen(true)}
             className="absolute top-4 left-4 z-20 p-2 text-obsidian-muted hover:text-white md:hidden"
           >
             {/* Hamburger handled in Sidebar component for visible state, this is just a trigger area if needed, 
                 but actually Sidebar toggle button handles open state visibility. 
                 We need a trigger when closed on desktop? No, desktop is always relative.
                 Mobile closed state needs a trigger. */}
           </button>
        )}
        
        {/* Top Notes Dropdown */}
        <div className="shrink-0 border-b border-obsidian-border bg-obsidian-sidebar/60 backdrop-blur px-4 py-2 flex items-center justify-between relative z-20">
          <div className="flex items-center gap-2" ref={notesDropdownRef}>
            <button
              onClick={() => setIsNotesDropdownOpen(v => !v)}
              className="px-3 py-1.5 rounded bg-obsidian-bg hover:bg-obsidian-active text-sm text-obsidian-text border border-obsidian-border"
              title="Notes"
            >
              {activeNote ? activeNote.title : 'Select a note'}
            </button>

            {isNotesDropdownOpen && (
              <div className="absolute top-full left-4 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-obsidian-sidebar border border-obsidian-border rounded-md shadow-xl overflow-hidden z-30">
                {notes.length === 0 ? (
                  <div className="p-3 text-sm text-obsidian-muted">No notes yet. Double-click the board to create one.</div>
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
                        filteredNotes.map(note => (
                          <li key={note.id}>
                            <div
                              className={
                                'w-full px-3 py-2 text-sm flex items-center justify-between gap-3 ' +
                                (note.id === activeNoteId ? 'bg-obsidian-active text-white' : 'text-obsidian-text hover:bg-obsidian-bg')
                              }
                            >
                              <button
                                onClick={() => {
                                  setActiveNoteId(note.id);
                                  setCenterOnRequest({ noteId: note.id, nonce: Date.now() });
                                  setIsNotesDropdownOpen(false);
                                  setNotesSearch('');
                                }}
                                className="min-w-0 flex-1 text-left"
                                title={note.title || 'Untitled'}
                              >
                                <span className="truncate block">{note.title || 'Untitled'}</span>
                              </button>
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

          <div className="text-xs text-obsidian-muted">Double-click the board to create a note</div>
        </div>

        <Whiteboard
          notes={notes}
          items={whiteboardItems}
          activeNoteId={activeNoteId}
          onActivateNote={(id) => setActiveNoteId(id)}
          onCreateNoteAt={handleCreateNoteAt}
          onUpdateItem={handleUpdateWhiteboardItem}
          onUpdateNoteContent={handleUpdateNoteContent}
          onUpdateNoteTitle={handleUpdateNoteTitle}
          centerOnRequest={centerOnRequest ?? undefined}
        />
      </main>
    </div>
  );
};

export default App;
