import type { Frame, Note, WhiteboardItem } from '@/shared/types';

const isPointInRect = (px: number, py: number, rect: { x: number; y: number; width: number; height: number }) => {
  return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
};

const pickBestFrameForPoint = (frames: Frame[], px: number, py: number): Frame | null => {
  const candidates = frames
    .filter((f) => isPointInRect(px, py, f))
    .map((f) => ({ frame: f, area: f.width * f.height }));

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.area - b.area);
  return candidates[0].frame;
};

/**
 * Computes which frame should contain an item, using the app's current rule:
 * - Use the item's center point
 * - If multiple frames contain it, choose the smallest-area frame
 */
export const getLiveFrameIdForItem = (item: WhiteboardItem, frames: Frame[]): string | null => {
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  return pickBestFrameForPoint(frames, cx, cy)?.id ?? null;
};

/**
 * Returns notes whose current (live) membership resolves to the given frame.
 * Notes without a matching WhiteboardItem are skipped.
 */
export const getLiveNotesInFrame = (params: {
  frameId: string;
  notes: Note[];
  items: WhiteboardItem[];
  frames: Frame[];
}): Note[] => {
  const { frameId, notes, items, frames } = params;
  const itemByNoteId = new Map(items.map((i) => [i.noteId, i] as const));

  const result: Note[] = [];
  for (const note of notes) {
    const item = itemByNoteId.get(note.id);
    if (!item) continue;
    const liveFrameId = getLiveFrameIdForItem(item, frames);
    if (liveFrameId === frameId) result.push(note);
  }
  return result;
};
