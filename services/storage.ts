import { Note, WhiteboardItem } from '../types';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'obsidian_clone_notes';
const WHITEBOARD_KEY = 'obsidian_clone_whiteboard_items';

export const getNotes = (): Note[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load notes", e);
    return [];
  }
};

export const saveNotes = (notes: Note[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch (e) {
    console.error("Failed to save notes", e);
  }
};

export const createNote = (): Note => {
  return {
    id: uuidv4(),
    title: 'Untitled Note',
    content: '# Untitled Note\n\nStart typing here...',
    updatedAt: Date.now(),
  };
};

export const updateNoteInStorage = (updatedNote: Note) => {
  const notes = getNotes();
  const index = notes.findIndex(n => n.id === updatedNote.id);
  if (index >= 0) {
    notes[index] = updatedNote;
  } else {
    notes.unshift(updatedNote);
  }
  saveNotes(notes);
};

export const deleteNoteFromStorage = (id: string) => {
  const notes = getNotes();
  const filtered = notes.filter(n => n.id !== id);
  saveNotes(filtered);
};

export const getWhiteboardItems = (): WhiteboardItem[] => {
  try {
    const data = localStorage.getItem(WHITEBOARD_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to load whiteboard items', e);
    return [];
  }
};

export const saveWhiteboardItems = (items: WhiteboardItem[]) => {
  try {
    localStorage.setItem(WHITEBOARD_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save whiteboard items', e);
  }
};

export const createWhiteboardItemForNote = (noteId: string, x: number, y: number): WhiteboardItem => {
  return {
    id: uuidv4(),
    noteId,
    x,
    y,
    width: 520,
    height: 420,
    z: Date.now(),
  };
};

export const upsertWhiteboardItem = (item: WhiteboardItem) => {
  const items = getWhiteboardItems();
  const index = items.findIndex(i => i.id === item.id);
  if (index >= 0) {
    items[index] = item;
  } else {
    items.push(item);
  }
  saveWhiteboardItems(items);
};

export const batchUpsertWhiteboardItems = (updates: WhiteboardItem[]) => {
  if (updates.length === 0) return;

  const items = getWhiteboardItems();
  const indexById = new Map(items.map((i, idx) => [i.id, idx] as const));

  for (const item of updates) {
    const idx = indexById.get(item.id);
    if (idx !== undefined) {
      items[idx] = item;
    } else {
      indexById.set(item.id, items.length);
      items.push(item);
    }
  }

  saveWhiteboardItems(items);
};

export const deleteWhiteboardItemsByNoteId = (noteId: string) => {
  const items = getWhiteboardItems();
  saveWhiteboardItems(items.filter(i => i.noteId !== noteId));
};
