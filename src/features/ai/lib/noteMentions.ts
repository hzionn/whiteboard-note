import type { Frame, Note, WhiteboardItem } from '@/shared/types';
import { getLiveNotesInFrame } from '@/shared/lib/frameMembership';

export type NoteContext = {
  id: string;
  title: string;
  content: string;
};

export type FrameRef = {
  id: string;
  name: string;
};

// Mention format inserted by the chat UI:
//   @[Some title](note:<noteId>)
const NOTE_MENTION_REGEX = /@\[[^\]]*\]\(note:([^\)\s]+)\)/g;
const FRAME_MENTION_REGEX = /@\[[^\]]*\]\(frame:([^\)\s]+)\)/g;

const ANY_MENTION_TOKEN_REGEX = /@\[([^\]]*)\]\((note|frame):([^\)\s]+)\)/g;

export const buildNoteMentionToken = (note: Pick<Note, 'id' | 'title'>): string => {
  const safeTitle = (note.title ?? '').trim() || 'Untitled Note';
  // Basic escaping for `]` to keep the token valid Markdown.
  const title = safeTitle.replace(/\]/g, '\\]');
  return `@[${title}](note:${note.id})`;
};

export const buildFrameMentionToken = (frame: Pick<Frame, 'id' | 'name'>): string => {
  const safeName = (frame.name ?? '').trim() || 'Untitled Frame';
  const name = safeName.replace(/\]/g, '\\]');
  return `@[${name}](frame:${frame.id})`;
};

/**
 * Removes internal IDs from mention tokens before sending text to the model.
 * Keeps the mention kind (note vs frame) so the model can interpret intent.
 * Examples:
 * - "@[frame1](frame:abc)" -> "@frame:frame1"
 * - "@[Welcome](note:abc)" -> "@note:Welcome"
 */
export const sanitizeChatTextForModel = (text: string): string => {
  if (!text) return '';
  return text.replace(ANY_MENTION_TOKEN_REGEX, (_full, label: string, kind: string) => {
    const cleaned = (label ?? '').replace(/\\\]/g, ']');
    if (kind === 'frame') return `@frame:${cleaned}`;
    return `@note:${cleaned}`;
  });
};

export const extractMentionedNoteIds = (text: string): string[] => {
  const ids = new Set<string>();
  NOTE_MENTION_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = NOTE_MENTION_REGEX.exec(text)) != null) {
    const id = match[1];
    if (id) ids.add(id);
  }
  return Array.from(ids);
};

export const extractMentionedFrameIds = (text: string): string[] => {
  const ids = new Set<string>();
  FRAME_MENTION_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FRAME_MENTION_REGEX.exec(text)) != null) {
    const id = match[1];
    if (id) ids.add(id);
  }
  return Array.from(ids);
};

export const resolveMentionedNotes = (
  text: string,
  notes: Array<Pick<Note, 'id' | 'title' | 'content'>>
): NoteContext[] => {
  const ids = new Set(extractMentionedNoteIds(text));
  if (ids.size === 0) return [];

  const byId = new Map(notes.map((n) => [n.id, n] as const));
  const resolved: NoteContext[] = [];
  for (const id of ids) {
    const note = byId.get(id);
    if (!note) continue;
    resolved.push({
      id: note.id,
      title: (note.title ?? '').trim() || 'Untitled Note',
      content: note.content ?? '',
    });
  }
  return resolved;
};

export const resolveMentionedFrames = (
  text: string,
  frames: Array<Pick<Frame, 'id' | 'name'>>
): FrameRef[] => {
  const ids = new Set(extractMentionedFrameIds(text));
  if (ids.size === 0) return [];
  const byId = new Map(frames.map((f) => [f.id, f] as const));
  const resolved: FrameRef[] = [];
  for (const id of ids) {
    const frame = byId.get(id);
    if (!frame) continue;
    resolved.push({
      id: frame.id,
      name: (frame.name ?? '').trim() || 'Untitled Frame',
    });
  }
  return resolved;
};

export const collectContextNotesFromMessages = (
  messages: Array<{ text: string }>,
  notes: Array<Pick<Note, 'id' | 'title' | 'content' | 'frameId'>>,
  opts?: {
    maxNotes?: number;
    frameIds?: string[];
  }
): NoteContext[] => {
  const maxNotes = opts?.maxNotes ?? 8;
  if (maxNotes <= 0) return [];

  // Preserve an intuitive order:
  // - Process messages oldest->newest
  // - Within a message, add explicit note mentions first, then notes in mentioned frames
  const added = new Set<string>();
  const resolved: NoteContext[] = [];

  const byId = new Map(notes.map((n) => [n.id, n] as const));

  for (const msg of messages) {
    const text = msg.text ?? '';

    for (const id of extractMentionedNoteIds(text)) {
      if (resolved.length >= maxNotes) break;
      if (added.has(id)) continue;
      const note = byId.get(id);
      if (!note) continue;
      added.add(id);
      resolved.push({
        id: note.id,
        title: (note.title ?? '').trim() || 'Untitled Note',
        content: note.content ?? '',
      });
    }
    if (resolved.length >= maxNotes) break;

    for (const frameId of extractMentionedFrameIds(text)) {
      if (resolved.length >= maxNotes) break;
      const inFrame = notes.filter((n) => (n.frameId ?? null) === frameId);
      for (const note of inFrame) {
        if (resolved.length >= maxNotes) break;
        if (added.has(note.id)) continue;
        if (!note.content?.trim()) continue;
        added.add(note.id);
        resolved.push({
          id: note.id,
          title: (note.title ?? '').trim() || 'Untitled Note',
          content: note.content ?? '',
        });
      }
    }
    if (resolved.length >= maxNotes) break;
  }

  return resolved;
};

/**
 * Collects note context from @note and @frame mentions.
 * Frame membership uses the live whiteboard rule (note position within frame),
 * not just `note.frameId`.
 */
export const collectContextNotesForChat = (params: {
  messages: Array<{ text: string }>;
  notes: Note[];
  items: WhiteboardItem[];
  frames: Frame[];
  maxNotes?: number;
}): NoteContext[] => {
  const { messages, notes, items, frames } = params;
  const maxNotes = params.maxNotes ?? 8;
  if (maxNotes <= 0) return [];

  const added = new Set<string>();
  const resolved: NoteContext[] = [];
  const byId = new Map(notes.map((n) => [n.id, n] as const));

  for (const msg of messages) {
    const text = msg.text ?? '';

    for (const id of extractMentionedNoteIds(text)) {
      if (resolved.length >= maxNotes) break;
      if (added.has(id)) continue;
      const note = byId.get(id);
      if (!note?.content?.trim()) continue;
      added.add(id);
      resolved.push({
        id: note.id,
        title: (note.title ?? '').trim() || 'Untitled Note',
        content: note.content ?? '',
      });
    }
    if (resolved.length >= maxNotes) break;

    for (const frameId of extractMentionedFrameIds(text)) {
      if (resolved.length >= maxNotes) break;
      const inFrame = getLiveNotesInFrame({ frameId, notes, items, frames });
      for (const note of inFrame) {
        if (resolved.length >= maxNotes) break;
        if (added.has(note.id)) continue;
        if (!note.content?.trim()) continue;
        added.add(note.id);
        resolved.push({
          id: note.id,
          title: (note.title ?? '').trim() || 'Untitled Note',
          content: note.content ?? '',
        });
      }
    }
    if (resolved.length >= maxNotes) break;
  }

  return resolved;
};
