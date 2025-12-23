import { Frame, Note, WhiteboardBoard, WhiteboardItem } from '../types';
import { v4 as uuidv4 } from 'uuid';

const LEGACY_NOTES_KEY = 'whiteboard-note_notes';
const LEGACY_WHITEBOARD_KEY = 'whiteboard-note_whiteboard_items';
const LEGACY_FRAMES_KEY = 'whiteboard-note_frames';

const BOARDS_KEY = 'whiteboard-note_whiteboards';
const ACTIVE_BOARD_ID_KEY = 'whiteboard-note_active_whiteboard_id';

const notesKeyForBoard = (boardId: string) => `whiteboard-note_board_${boardId}_notes`;
const whiteboardItemsKeyForBoard = (boardId: string) =>
  `whiteboard-note_board_${boardId}_whiteboard_items`;
const framesKeyForBoard = (boardId: string) => `whiteboard-note_board_${boardId}_frames`;

const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error('Failed to parse localStorage JSON', e);
    return fallback;
  }
};

export const getBoards = (): WhiteboardBoard[] => {
  try {
    return safeParse<WhiteboardBoard[]>(localStorage.getItem(BOARDS_KEY), []);
  } catch (e) {
    console.error('Failed to load boards', e);
    return [];
  }
};

export const saveBoards = (boards: WhiteboardBoard[]) => {
  try {
    localStorage.setItem(BOARDS_KEY, JSON.stringify(boards));
  } catch (e) {
    console.error('Failed to save boards', e);
  }
};

export const getActiveBoardId = (): string | null => {
  try {
    return localStorage.getItem(ACTIVE_BOARD_ID_KEY);
  } catch (e) {
    console.error('Failed to load active board id', e);
    return null;
  }
};

export const setActiveBoardId = (boardId: string) => {
  try {
    localStorage.setItem(ACTIVE_BOARD_ID_KEY, boardId);
  } catch (e) {
    console.error('Failed to save active board id', e);
  }
};

export const createBoard = (name?: string): WhiteboardBoard => {
  const now = Date.now();
  return {
    id: uuidv4(),
    name: name?.trim() ? name.trim() : 'Untitled Whiteboard',
    createdAt: now,
    updatedAt: now,
  };
};

export const renameBoard = (boardId: string, name: string): WhiteboardBoard[] => {
  const nextName = name.trim() ? name.trim() : 'Untitled Whiteboard';
  const boards = getBoards();
  const nextBoards = boards.map((b) =>
    b.id === boardId ? { ...b, name: nextName, updatedAt: Date.now() } : b
  );
  saveBoards(nextBoards);
  return nextBoards;
};

export const ensureBoardsInitialized = (opts?: {
  defaultBoardName?: string;
}): { boards: WhiteboardBoard[]; activeBoardId: string } => {
  const existingBoards = getBoards();
  const existingActive = getActiveBoardId();

  if (existingBoards.length > 0) {
    const activeBoardId =
      existingActive && existingBoards.some((b) => b.id === existingActive)
        ? existingActive
        : existingBoards[0].id;
    if (activeBoardId !== existingActive) setActiveBoardId(activeBoardId);
    return { boards: existingBoards, activeBoardId };
  }

  // Migration from legacy single-board keys.
  const legacyNotesRaw = localStorage.getItem(LEGACY_NOTES_KEY);
  const legacyItemsRaw = localStorage.getItem(LEGACY_WHITEBOARD_KEY);
  const legacyFramesRaw = localStorage.getItem(LEGACY_FRAMES_KEY);

  const hasLegacy = !!(legacyNotesRaw || legacyItemsRaw || legacyFramesRaw);

  const board = createBoard(opts?.defaultBoardName ?? 'Main Whiteboard');
  saveBoards([board]);
  setActiveBoardId(board.id);

  if (hasLegacy) {
    const legacyNotes = safeParse<Note[]>(legacyNotesRaw, []);
    const legacyItems = safeParse<WhiteboardItem[]>(legacyItemsRaw, []);
    const legacyFrames = safeParse<Frame[]>(legacyFramesRaw, []);

    // Write into board-scoped keys.
    try {
      localStorage.setItem(notesKeyForBoard(board.id), JSON.stringify(legacyNotes));
      localStorage.setItem(whiteboardItemsKeyForBoard(board.id), JSON.stringify(legacyItems));
      localStorage.setItem(framesKeyForBoard(board.id), JSON.stringify(legacyFrames));
    } catch (e) {
      console.error('Failed to migrate legacy storage', e);
    }

    // Best-effort cleanup so we don't keep reading stale data.
    try {
      localStorage.removeItem(LEGACY_NOTES_KEY);
      localStorage.removeItem(LEGACY_WHITEBOARD_KEY);
      localStorage.removeItem(LEGACY_FRAMES_KEY);
    } catch {
      // ignore
    }
  }

  return { boards: [board], activeBoardId: board.id };
};

export const deleteBoardData = (boardId: string) => {
  try {
    localStorage.removeItem(notesKeyForBoard(boardId));
    localStorage.removeItem(whiteboardItemsKeyForBoard(boardId));
    localStorage.removeItem(framesKeyForBoard(boardId));
  } catch (e) {
    console.error('Failed to delete board data', e);
  }
};

export const getNotes = (boardId: string): Note[] => {
  try {
    return safeParse<Note[]>(localStorage.getItem(notesKeyForBoard(boardId)), []);
  } catch (e) {
    console.error('Failed to load notes', e);
    return [];
  }
};

export const saveNotes = (boardId: string, notes: Note[]) => {
  try {
    localStorage.setItem(notesKeyForBoard(boardId), JSON.stringify(notes));
  } catch (e) {
    console.error('Failed to save notes', e);
  }
};

export const createNote = (): Note => {
  return {
    id: uuidv4(),
    title: 'Untitled Note',
    content: '# Untitled Note\n\nStart typing here...',
    updatedAt: Date.now(),
    number: null,
    frameId: null,
  };
};

export const getFrames = (boardId: string): Frame[] => {
  try {
    return safeParse<Frame[]>(localStorage.getItem(framesKeyForBoard(boardId)), []);
  } catch (e) {
    console.error('Failed to load frames', e);
    return [];
  }
};

export const saveFrames = (boardId: string, frames: Frame[]) => {
  try {
    localStorage.setItem(framesKeyForBoard(boardId), JSON.stringify(frames));
  } catch (e) {
    console.error('Failed to save frames', e);
  }
};

export const createFrame = (x: number, y: number): Frame => {
  return {
    id: uuidv4(),
    name: 'Untitled Frame',
    x,
    y,
    width: 720,
    height: 520,
    z: Date.now(),
    updatedAt: Date.now(),
  };
};

export const upsertFrame = (boardId: string, frame: Frame) => {
  const frames = getFrames(boardId);
  const idx = frames.findIndex((f) => f.id === frame.id);
  if (idx >= 0) {
    frames[idx] = frame;
  } else {
    frames.push(frame);
  }
  saveFrames(boardId, frames);
};

export const deleteFrameFromStorage = (boardId: string, id: string) => {
  const frames = getFrames(boardId);
  saveFrames(
    boardId,
    frames.filter((f) => f.id !== id)
  );
};

export const updateNoteInStorage = (boardId: string, updatedNote: Note) => {
  const notes = getNotes(boardId);
  const index = notes.findIndex((n) => n.id === updatedNote.id);
  if (index >= 0) {
    notes[index] = updatedNote;
  } else {
    notes.unshift(updatedNote);
  }
  saveNotes(boardId, notes);
};

export const deleteNoteFromStorage = (boardId: string, id: string) => {
  const notes = getNotes(boardId);
  const filtered = notes.filter((n) => n.id !== id);
  saveNotes(boardId, filtered);
};

export const getWhiteboardItems = (boardId: string): WhiteboardItem[] => {
  try {
    return safeParse<WhiteboardItem[]>(
      localStorage.getItem(whiteboardItemsKeyForBoard(boardId)),
      []
    );
  } catch (e) {
    console.error('Failed to load whiteboard items', e);
    return [];
  }
};

export const saveWhiteboardItems = (boardId: string, items: WhiteboardItem[]) => {
  try {
    localStorage.setItem(whiteboardItemsKeyForBoard(boardId), JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save whiteboard items', e);
  }
};

export const createWhiteboardItemForNote = (
  noteId: string,
  x: number,
  y: number
): WhiteboardItem => {
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

export const upsertWhiteboardItem = (boardId: string, item: WhiteboardItem) => {
  const items = getWhiteboardItems(boardId);
  const index = items.findIndex((i) => i.id === item.id);
  if (index >= 0) {
    items[index] = item;
  } else {
    items.push(item);
  }
  saveWhiteboardItems(boardId, items);
};

export const batchUpsertWhiteboardItems = (boardId: string, updates: WhiteboardItem[]) => {
  if (updates.length === 0) return;

  const items = getWhiteboardItems(boardId);
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

  saveWhiteboardItems(boardId, items);
};

export const deleteWhiteboardItemsByNoteId = (boardId: string, noteId: string) => {
  const items = getWhiteboardItems(boardId);
  saveWhiteboardItems(
    boardId,
    items.filter((i) => i.noteId !== noteId)
  );
};
