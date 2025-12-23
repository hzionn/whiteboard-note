'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Frame, Note, WhiteboardItem } from '@/shared/types';
import { Editor } from '@/features/editor/components/Editor';
import { Sparkles, Trash2 } from 'lucide-react';
import { generateCompletion } from '@/features/ai/services/geminiService';

type DragState = {
  itemId: string;
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startX: number;
  startY: number;
} | null;

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type ResizeState = {
  itemId: string;
  pointerId: number;
  dir: ResizeDir;
  startPointerX: number;
  startPointerY: number;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
} | null;

interface WhiteboardProps {
  notes: Note[];
  items: WhiteboardItem[];
  frames: Frame[];
  activeNoteId: string | null;
  onActivateNote: (noteId: string | null) => void;
  onJumpToNote: (noteId: string) => void;
  onCreateNoteAt: (x: number, y: number) => void;
  onUpdateItem: (item: WhiteboardItem) => void;
  onUpdateNoteContent: (noteId: string, content: string) => void;
  onUpdateNoteTitle: (noteId: string, title: string) => void;
  onAssignNoteToFrame: (noteId: string, frameId: string | null) => void;
  onUpdateFrame: (frame: Frame) => void;
  onDeleteNote: (noteId: string) => void;
  centerOnRequest?: { noteId: string; nonce: number };
  centerOnFrameRequest?: { frameId: string; nonce: number };
}

type Camera = {
  tx: number;
  ty: number;
  scale: number;
};

type PanState = {
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startTx: number;
  startTy: number;
} | null;

export const Whiteboard: React.FC<WhiteboardProps> = ({
  notes,
  items,
  frames,
  activeNoteId,
  onActivateNote,
  onJumpToNote,
  onCreateNoteAt,
  onUpdateItem,
  onUpdateNoteContent,
  onUpdateNoteTitle,
  onAssignNoteToFrame,
  onUpdateFrame,
  onDeleteNote,
  centerOnRequest,
  centerOnFrameRequest,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const worldRef = useRef<HTMLDivElement>(null);

  const itemsRef = useRef<WhiteboardItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const framesRef = useRef<Frame[]>(frames);
  useEffect(() => {
    framesRef.current = frames;
  }, [frames]);

  const onUpdateNoteContentRef = useRef(onUpdateNoteContent);
  const onUpdateNoteTitleRef = useRef(onUpdateNoteTitle);
  useEffect(() => {
    onUpdateNoteContentRef.current = onUpdateNoteContent;
    onUpdateNoteTitleRef.current = onUpdateNoteTitle;
  }, [onUpdateNoteContent, onUpdateNoteTitle]);

  const noteContentChangeHandlers = useMemo(() => {
    const handlers: Record<string, (value: string) => void> = {};
    for (const note of notes) {
      handlers[note.id] = (value: string) => onUpdateNoteContentRef.current(note.id, value);
    }
    return handlers;
  }, [notes]);

  const noteTitleChangeHandlers = useMemo(() => {
    const handlers: Record<string, (value: string) => void> = {};
    for (const note of notes) {
      handlers[note.id] = (value: string) => onUpdateNoteTitleRef.current(note.id, value);
    }
    return handlers;
  }, [notes]);

  const [drag, setDrag] = useState<DragState>(null);
  const [resize, setResize] = useState<ResizeState>(null);
  const [frameDrag, setFrameDrag] = useState<DragState>(null);
  const [frameResize, setFrameResize] = useState<ResizeState>(null);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [pan, setPan] = useState<PanState>(null);

  const [aiLoadingNoteId, setAiLoadingNoteId] = useState<string | null>(null);
  const [aiErrorNoteId, setAiErrorNoteId] = useState<string | null>(null);
  const noteOrderById = useMemo(() => {
    const map = new Map<string, number>();
    notes.forEach((n, idx) => map.set(n.id, idx + 1));
    return map;
  }, [notes]);

  const navigableNotes = useMemo(() => {
    const noteIdsWithItems = new Set(items.map((i) => i.noteId));
    // Use current notes array order; skip notes without items.
    return notes.filter((n) => noteIdsWithItems.has(n.id));
  }, [notes, items]);

  const activeNavigableIndex = useMemo(() => {
    if (!activeNoteId) return -1;
    return navigableNotes.findIndex((n) => n.id === activeNoteId);
  }, [navigableNotes, activeNoteId]);

  const prevTarget = useMemo(() => {
    if (navigableNotes.length === 0) return null;
    if (activeNavigableIndex >= 0) {
      return activeNavigableIndex > 0 ? navigableNotes[activeNavigableIndex - 1] : null;
    }
    return navigableNotes[navigableNotes.length - 1];
  }, [navigableNotes, activeNavigableIndex]);

  const nextTarget = useMemo(() => {
    if (navigableNotes.length === 0) return null;
    if (activeNavigableIndex >= 0) {
      return activeNavigableIndex < navigableNotes.length - 1
        ? navigableNotes[activeNavigableIndex + 1]
        : null;
    }
    return navigableNotes[0];
  }, [navigableNotes, activeNavigableIndex]);

  const handleAiActionForNote = async (
    note: Note,
    type: 'continue' | 'summarize' | 'improve'
  ) => {
    const content = note.content ?? '';
    if (!content.trim()) return;

    setAiErrorNoteId(null);
    setAiLoadingNoteId(note.id);
    try {
      const result = await generateCompletion(content, content, type);
      const handler = noteContentChangeHandlers[note.id];
      if (!handler) return;

      if (type === 'continue') {
        const next = content + (content.endsWith(' ') ? '' : ' ') + result;
        handler(next);
      } else if (type === 'summarize') {
        handler(content + `\n\n### AI Summary\n${result}`);
      } else {
        handler(result);
      }
    } catch {
      setAiErrorNoteId(note.id);
    } finally {
      setAiLoadingNoteId((v) => (v === note.id ? null : v));
    }
  };

  const cameraRef = useRef<Camera>({ tx: 0, ty: 0, scale: 1 });
  const applyRafIdRef = useRef<number | null>(null);
  const applyCamera = (next: Camera) => {
    cameraRef.current = next;
    if (applyRafIdRef.current != null) return;
    applyRafIdRef.current = window.requestAnimationFrame(() => {
      applyRafIdRef.current = null;
      const el = worldRef.current;
      if (!el) return;
      const cam = cameraRef.current;
      el.style.transform = `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.scale})`;
      el.style.transformOrigin = '0 0';
      el.style.setProperty('--wb-scale', String(cam.scale));
    });
  };

  useEffect(() => {
    applyCamera(cameraRef.current);
    return () => {
      if (applyRafIdRef.current != null) {
        window.cancelAnimationFrame(applyRafIdRef.current);
        applyRafIdRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const MIN_W = 320;
  const MIN_H = 220;

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

  const isEditableTarget = (el: EventTarget | null) => {
    const node = el as HTMLElement | null;
    if (!node) return false;
    const tag = node.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (node.isContentEditable) return true;
    // CodeMirror uses contenteditable under the hood
    if (node.closest('.cm-editor')) return true;
    return false;
  };

  const maxZ = useMemo(() => {
    if (items.length === 0) return 0;
    return items.reduce((acc, item) => (item.z > acc ? item.z : acc), items[0].z);
  }, [items]);

  const maxFrameZ = useMemo(() => {
    if (frames.length === 0) return 0;
    return frames.reduce((acc, f) => (f.z > acc ? f.z : acc), frames[0].z);
  }, [frames]);

  const findContainingFrameIdForItem = (item: WhiteboardItem): string | null => {
    const cx = item.x + item.width / 2;
    const cy = item.y + item.height / 2;
    const candidates = framesRef.current
      .filter((f) => cx >= f.x && cx <= f.x + f.width && cy >= f.y && cy <= f.y + f.height)
      .map((f) => ({ id: f.id, area: f.width * f.height }));
    if (candidates.length === 0) return null;
    // If multiple frames overlap, choose the smallest (most specific).
    candidates.sort((a, b) => a.area - b.area);
    return candidates[0].id;
  };

  useEffect(() => {
    if (!drag) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!drag) return;
      if (e.pointerId !== drag.pointerId) return;

      const dx = e.clientX - drag.startPointerX;
      const dy = e.clientY - drag.startPointerY;
      const scale = cameraRef.current.scale;
      const dxWorld = dx / scale;
      const dyWorld = dy / scale;

      const item = itemsRef.current.find((i) => i.id === drag.itemId);
      if (!item) return;

      onUpdateItem({
        ...item,
        x: drag.startX + dxWorld,
        y: drag.startY + dyWorld,
      });
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!drag) return;
      if (e.pointerId !== drag.pointerId) return;

      const item = itemsRef.current.find((i) => i.id === drag.itemId);
      if (item) {
        const nextFrameId = findContainingFrameIdForItem(item);
        onAssignNoteToFrame(item.noteId, nextFrameId);
      }

      setDrag(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [drag, onUpdateItem]);

  useEffect(() => {
    if (!frameDrag) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!frameDrag) return;
      if (e.pointerId !== frameDrag.pointerId) return;

      const dx = e.clientX - frameDrag.startPointerX;
      const dy = e.clientY - frameDrag.startPointerY;
      const scale = cameraRef.current.scale;
      const dxWorld = dx / scale;
      const dyWorld = dy / scale;

      const frame = framesRef.current.find((f) => f.id === frameDrag.itemId);
      if (!frame) return;

      onUpdateFrame({
        ...frame,
        x: frameDrag.startX + dxWorld,
        y: frameDrag.startY + dyWorld,
        updatedAt: Date.now(),
      });
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!frameDrag) return;
      if (e.pointerId !== frameDrag.pointerId) return;
      setFrameDrag(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [frameDrag, onUpdateFrame]);

  useEffect(() => {
    if (!resize) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!resize) return;
      if (e.pointerId !== resize.pointerId) return;

      const dx = e.clientX - resize.startPointerX;
      const dy = e.clientY - resize.startPointerY;
      const scale = cameraRef.current.scale;
      const dxWorld = dx / scale;
      const dyWorld = dy / scale;

      const item = itemsRef.current.find((i) => i.id === resize.itemId);
      if (!item) return;

      let nextX = resize.startX;
      let nextY = resize.startY;
      let nextW = resize.startW;
      let nextH = resize.startH;

      const dir = resize.dir;

      if (dir.includes('e')) {
        nextW = Math.max(MIN_W, resize.startW + dxWorld);
      }

      if (dir.includes('s')) {
        nextH = Math.max(MIN_H, resize.startH + dyWorld);
      }

      if (dir.includes('w')) {
        const rawW = resize.startW - dxWorld;
        nextW = Math.max(MIN_W, rawW);
        const appliedDx = resize.startW - nextW;
        nextX = resize.startX + appliedDx;
      }

      if (dir.includes('n')) {
        const rawH = resize.startH - dyWorld;
        nextH = Math.max(MIN_H, rawH);
        const appliedDy = resize.startH - nextH;
        nextY = resize.startY + appliedDy;
      }

      onUpdateItem({
        ...item,
        x: nextX,
        y: nextY,
        width: nextW,
        height: nextH,
      });
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!resize) return;
      if (e.pointerId !== resize.pointerId) return;
      setResize(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [resize, onUpdateItem]);

  useEffect(() => {
    if (!frameResize) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!frameResize) return;
      if (e.pointerId !== frameResize.pointerId) return;

      const dx = e.clientX - frameResize.startPointerX;
      const dy = e.clientY - frameResize.startPointerY;
      const scale = cameraRef.current.scale;
      const dxWorld = dx / scale;
      const dyWorld = dy / scale;

      const frame = framesRef.current.find((f) => f.id === frameResize.itemId);
      if (!frame) return;

      let nextX = frameResize.startX;
      let nextY = frameResize.startY;
      let nextW = frameResize.startW;
      let nextH = frameResize.startH;

      const dir = frameResize.dir;

      if (dir.includes('e')) {
        nextW = Math.max(MIN_W, frameResize.startW + dxWorld);
      }

      if (dir.includes('s')) {
        nextH = Math.max(MIN_H, frameResize.startH + dyWorld);
      }

      if (dir.includes('w')) {
        const rawW = frameResize.startW - dxWorld;
        nextW = Math.max(MIN_W, rawW);
        const appliedDx = frameResize.startW - nextW;
        nextX = frameResize.startX + appliedDx;
      }

      if (dir.includes('n')) {
        const rawH = frameResize.startH - dyWorld;
        nextH = Math.max(MIN_H, rawH);
        const appliedDy = frameResize.startH - nextH;
        nextY = frameResize.startY + appliedDy;
      }

      onUpdateFrame({
        ...frame,
        x: nextX,
        y: nextY,
        width: nextW,
        height: nextH,
        updatedAt: Date.now(),
      });
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!frameResize) return;
      if (e.pointerId !== frameResize.pointerId) return;
      setFrameResize(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [frameResize, onUpdateFrame]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (isEditableTarget(e.target)) return;
      // Prevent page scrolling on space
      e.preventDefault();
      setIsSpaceDown(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      setIsSpaceDown(false);
      setPan(null);
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keyup', handleKeyUp, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (!pan) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!pan) return;
      if (e.pointerId !== pan.pointerId) return;

      const dx = e.clientX - pan.startPointerX;
      const dy = e.clientY - pan.startPointerY;
      const prev = cameraRef.current;
      applyCamera({ ...prev, tx: pan.startTx + dx, ty: pan.startTy + dy });
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!pan) return;
      if (e.pointerId !== pan.pointerId) return;
      setPan(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [pan]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (!e.metaKey) return;
      // Override browser zoom (Cmd+wheel) for whiteboard zoom
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const prev = cameraRef.current;
      const oldScale = prev.scale;
      const zoomFactor = Math.pow(1.0015, -e.deltaY);
      const nextScale = clamp(oldScale * zoomFactor, 0.25, 2.5);
      if (nextScale === oldScale) return;

      // Keep the world-point under the cursor stable.
      const worldX = (mouseX - prev.tx) / oldScale;
      const worldY = (mouseY - prev.ty) / oldScale;
      const nextTx = mouseX - worldX * nextScale;
      const nextTy = mouseY - worldY * nextScale;

      applyCamera({ tx: nextTx, ty: nextTy, scale: nextScale });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, []);

  useEffect(() => {
    if (!centerOnRequest) return;
    const el = containerRef.current;
    if (!el) return;

    const item = items.find((i) => i.noteId === centerOnRequest.noteId);
    if (!item) return;

    const rect = el.getBoundingClientRect();
    const viewportW = rect.width;
    const viewportH = rect.height;

    const worldCenterX = item.x + item.width / 2;
    const worldCenterY = item.y + item.height / 2;

    const prev = cameraRef.current;
    const nextTx = viewportW / 2 - worldCenterX * prev.scale;
    const nextTy = viewportH / 2 - worldCenterY * prev.scale;
    applyCamera({ ...prev, tx: nextTx, ty: nextTy });
  }, [centerOnRequest?.nonce]);

  useEffect(() => {
    if (!centerOnFrameRequest) return;
    const el = containerRef.current;
    if (!el) return;

    const frame = frames.find((f) => f.id === centerOnFrameRequest.frameId);
    if (!frame) return;

    const rect = el.getBoundingClientRect();
    const viewportW = rect.width;
    const viewportH = rect.height;

    const worldCenterX = frame.x + frame.width / 2;
    const worldCenterY = frame.y + frame.height / 2;

    const prev = cameraRef.current;
    const nextTx = viewportW / 2 - worldCenterX * prev.scale;
    const nextTy = viewportH / 2 - worldCenterY * prev.scale;
    applyCamera({ ...prev, tx: nextTx, ty: nextTy });
  }, [centerOnFrameRequest?.nonce]);

  const bumpToFront = (item: WhiteboardItem) => {
    const nextZ = maxZ + 1;
    if (item.z === nextZ) return;
    onUpdateItem({ ...item, z: nextZ });
  };

  const bumpFrameToFront = (frame: Frame) => {
    const nextZ = maxFrameZ + 1;
    if (frame.z === nextZ) return;
    onUpdateFrame({ ...frame, z: nextZ, updatedAt: Date.now() });
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    // Only create a new note when double-clicking the canvas background.
    // Double-clicks inside an existing note (e.g., text selection) should not create notes.
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.closest('[data-whiteboard-note="true"]') ||
        target.closest('[data-whiteboard-frame="true"]'))
    ) {
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const cam = cameraRef.current;
    const x = (screenX - cam.tx) / cam.scale;
    const y = (screenY - cam.ty) / cam.scale;

    onCreateNoteAt(x, y);
  };

  return (
    <div className="flex-1 h-full overflow-hidden relative">
      <div
        ref={containerRef}
        className={
          `h-full w-full overflow-hidden bg-obsidian-bg ` +
          `${isSpaceDown ? (pan ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'}`
        }
        onDoubleClick={handleCanvasDoubleClick}
        onPointerDown={(e) => {
          if (!isSpaceDown) return;
          const target = e.target as HTMLElement | null;
          if (
            target &&
            (target.closest('[data-whiteboard-note="true"]') ||
              target.closest('[data-whiteboard-frame="true"]'))
          ) {
            return;
          }
          e.preventDefault();
          const cam = cameraRef.current;
          setPan({
            pointerId: e.pointerId,
            startPointerX: e.clientX,
            startPointerY: e.clientY,
            startTx: cam.tx,
            startTy: cam.ty,
          });
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        }}
        onClick={(e) => {
          const target = e.target as HTMLElement | null;
          if (
            target &&
            (target.closest('[data-whiteboard-note="true"]') ||
              target.closest('[data-whiteboard-frame="true"]'))
          ) {
            return;
          }
          onActivateNote(null);

          // Ensure any focused editor/input actually loses focus so live preview can hide syntax.
          const active = document.activeElement as HTMLElement | null;
          if (active && typeof active.blur === 'function') {
            active.blur();
          }
        }}
      >
        <div
          className="relative w-full h-full"
          ref={worldRef}
          style={{
            transform: `translate(${cameraRef.current.tx}px, ${cameraRef.current.ty}px) scale(${cameraRef.current.scale})`,
            transformOrigin: '0 0',
            // unitless so we can use it in calc()
            ['--wb-scale' as any]: String(cameraRef.current.scale),
          }}
        >
          {/* Frames (rendered behind notes) */}
          {frames
            .slice()
            .sort((a, b) => a.z - b.z)
            .map((frame) => {
              const edge = 'min(24px, calc(6px / var(--wb-scale)))';
              const corner = 'min(32px, calc(10px / var(--wb-scale)))';
              const inset = 'min(48px, calc(10px / var(--wb-scale)))';

              return (
                <div
                  key={frame.id}
                  data-whiteboard-frame="true"
                  className="absolute rounded-md border border-obsidian-border pointer-events-none"
                  style={{
                    left: frame.x,
                    top: frame.y,
                    width: frame.width,
                    height: frame.height,
                    // Keep frame UI (header/handles) above notes so rename is always possible.
                    // The container is pointer-events:none so it won't block interacting with notes.
                    zIndex: frame.z + 2000000,
                    backgroundColor: 'transparent',
                  }}
                  onPointerDown={() => {
                    bumpFrameToFront(frame);
                  }}
                >
                  {/* Resize handles */}
                  {[
                    {
                      dir: 'n' as const,
                      style: { left: inset, right: inset, top: 0, height: edge },
                      cursor: 'n-resize',
                    },
                    {
                      dir: 's' as const,
                      style: { left: inset, right: inset, bottom: 0, height: edge },
                      cursor: 's-resize',
                    },
                    {
                      dir: 'w' as const,
                      style: { top: inset, bottom: inset, left: 0, width: edge },
                      cursor: 'w-resize',
                    },
                    {
                      dir: 'e' as const,
                      style: { top: inset, bottom: inset, right: 0, width: edge },
                      cursor: 'e-resize',
                    },
                    {
                      dir: 'nw' as const,
                      style: { left: 0, top: 0, width: corner, height: corner },
                      cursor: 'nwse-resize',
                    },
                    {
                      dir: 'ne' as const,
                      style: { right: 0, top: 0, width: corner, height: corner },
                      cursor: 'nesw-resize',
                    },
                    {
                      dir: 'sw' as const,
                      style: { left: 0, bottom: 0, width: corner, height: corner },
                      cursor: 'nesw-resize',
                    },
                    {
                      dir: 'se' as const,
                      style: { right: 0, bottom: 0, width: corner, height: corner },
                      cursor: 'nwse-resize',
                    },
                  ].map((h) => (
                    <div
                      key={h.dir}
                      className="absolute z-10 pointer-events-auto"
                      style={{ ...h.style, cursor: h.cursor }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        bumpFrameToFront(frame);
                        setFrameResize({
                          itemId: frame.id,
                          pointerId: e.pointerId,
                          dir: h.dir,
                          startPointerX: e.clientX,
                          startPointerY: e.clientY,
                          startX: frame.x,
                          startY: frame.y,
                          startW: frame.width,
                          startH: frame.height,
                        });
                        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                      }}
                    />
                  ))}

                  <div
                    data-whiteboard-frame="true"
                    className="h-10 px-3 flex items-center justify-between bg-obsidian-sidebar/60 pointer-events-auto"
                    onPointerDown={(e) => {
                      // Allow input focus without dragging
                      const target = e.target as HTMLElement | null;
                      if (
                        target &&
                        (target.tagName?.toLowerCase() === 'input' || target.closest('input'))
                      ) {
                        e.stopPropagation();
                        return;
                      }

                      e.stopPropagation();
                      bumpFrameToFront(frame);
                      setFrameDrag({
                        itemId: frame.id,
                        pointerId: e.pointerId,
                        startPointerX: e.clientX,
                        startPointerY: e.clientY,
                        startX: frame.x,
                        startY: frame.y,
                      });
                      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    style={{ cursor: 'move' }}
                  >
                    <input
                      value={frame.name}
                      onChange={(e) => {
                        onUpdateFrame({ ...frame, name: e.target.value, updatedAt: Date.now() });
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className="min-w-0 w-56 max-w-[65%] bg-transparent text-sm font-medium text-obsidian-text outline-none select-text"
                      placeholder="Untitled Frame"
                      title={frame.name || 'Untitled Frame'}
                    />
                    <div className="w-2 h-2 rounded-full bg-obsidian-accent" />
                  </div>

                  {/* Transparent interior (keeps notes visible) */}
                  <div className="h-[calc(100%-2.5rem)]" />
                </div>
              );
            })}

          {items
            .slice()
            .sort((a, b) => a.z - b.z)
            .map((item) => {
              const note = noteById.get(item.noteId);
              if (!note) return null;

              const isActive = activeNoteId === note.id;

              const edge = 'min(24px, calc(6px / var(--wb-scale)))';
              const corner = 'min(32px, calc(10px / var(--wb-scale)))';
              const inset = 'min(48px, calc(10px / var(--wb-scale)))';

              return (
                <div
                  key={item.id}
                  data-whiteboard-note="true"
                  className={
                    `absolute rounded-md border border-obsidian-border overflow-hidden ` +
                    `${isActive ? 'ring-2 ring-obsidian-accent' : ''}`
                  }
                  style={{
                    left: item.x,
                    top: item.y,
                    width: item.width,
                    height: item.height,
                    zIndex: item.z + 1000000,
                    backgroundColor: 'transparent',
                  }}
                  onPointerDown={() => {
                    onActivateNote(note.id);
                    bumpToFront(item);
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  {/* Resize handles (thin hit areas along the border) */}
                  {[
                    {
                      dir: 'n' as const,
                      style: { left: inset, right: inset, top: 0, height: edge },
                      cursor: 'n-resize',
                    },
                    {
                      dir: 's' as const,
                      style: { left: inset, right: inset, bottom: 0, height: edge },
                      cursor: 's-resize',
                    },
                    {
                      dir: 'w' as const,
                      style: { top: inset, bottom: inset, left: 0, width: edge },
                      cursor: 'w-resize',
                    },
                    {
                      dir: 'e' as const,
                      style: { top: inset, bottom: inset, right: 0, width: edge },
                      cursor: 'e-resize',
                    },
                    {
                      dir: 'nw' as const,
                      style: { left: 0, top: 0, width: corner, height: corner },
                      cursor: 'nwse-resize',
                    },
                    {
                      dir: 'ne' as const,
                      style: { right: 0, top: 0, width: corner, height: corner },
                      cursor: 'nesw-resize',
                    },
                    {
                      dir: 'sw' as const,
                      style: { left: 0, bottom: 0, width: corner, height: corner },
                      cursor: 'nesw-resize',
                    },
                    {
                      dir: 'se' as const,
                      style: { right: 0, bottom: 0, width: corner, height: corner },
                      cursor: 'nwse-resize',
                    },
                  ].map((h) => (
                    <div
                      key={h.dir}
                      className="absolute z-20"
                      style={{ ...h.style, cursor: h.cursor }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onActivateNote(note.id);
                        bumpToFront(item);

                        setResize({
                          itemId: item.id,
                          pointerId: e.pointerId,
                          dir: h.dir,
                          startPointerX: e.clientX,
                          startPointerY: e.clientY,
                          startX: item.x,
                          startY: item.y,
                          startW: item.width,
                          startH: item.height,
                        });
                        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                      }}
                    />
                  ))}

                  <div
                    className={
                      `h-10 px-3 flex items-center justify-between select-none ` +
                      `${isActive ? 'bg-obsidian-active' : 'bg-obsidian-sidebar'}`
                    }
                    onPointerDown={(e) => {
                      e.stopPropagation();

                      // Don't start dragging if the delete button was pressed.
                      const target = e.target as HTMLElement | null;
                      if (target && target.closest('[data-note-delete="true"]')) {
                        return;
                      }

                      if (target && target.closest('[data-note-ai="true"]')) {
                        return;
                      }

                      // Allow title editing without dragging.
                      if (target && (target.tagName?.toLowerCase() === 'input' || target.closest('input')))
                        return;

                      onActivateNote(note.id);
                      bumpToFront(item);

                      setDrag({
                        itemId: item.id,
                        pointerId: e.pointerId,
                        startPointerX: e.clientX,
                        startPointerY: e.clientY,
                        startX: item.x,
                        startY: item.y,
                      });
                      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                    }}
                    style={{ cursor: 'move' }}
                  >
                    <div className="flex items-center gap-2 min-w-0 w-56 max-w-[65%]">
                      <span
                        className="shrink-0 h-6 min-w-6 px-2 rounded-full border border-obsidian-border bg-obsidian-bg text-xs text-obsidian-text"
                        title="Note order"
                      >
                        {noteOrderById.get(note.id) ?? 0}
                      </span>

                      <input
                        value={note.title}
                        onChange={(e) => noteTitleChangeHandlers[note.id]?.(e.target.value)}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-obsidian-text outline-none select-text"
                        placeholder="Untitled"
                        title={note.title || 'Untitled'}
                        aria-label="Note title"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative group" data-note-ai="true">
                        <button
                          type="button"
                          className="shrink-0 p-1 rounded text-obsidian-muted hover:text-obsidian-accent hover:bg-black/10"
                          title="AI Assistant"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Sparkles size={16} />
                        </button>
                        <div className="absolute right-0 mt-2 w-48 bg-obsidian-sidebar border border-obsidian-border rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 transform origin-top-right">
                          <div className="py-1">
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAiActionForNote(note, 'continue');
                              }}
                              className="block w-full text-left px-4 py-2 text-sm text-obsidian-text hover:bg-obsidian-accent hover:text-obsidian-strong"
                            >
                              Continue Writing
                            </button>
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAiActionForNote(note, 'summarize');
                              }}
                              className="block w-full text-left px-4 py-2 text-sm text-obsidian-text hover:bg-obsidian-accent hover:text-obsidian-strong"
                            >
                              Summarize Note
                            </button>
                            <button
                              type="button"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAiActionForNote(note, 'improve');
                              }}
                              className="block w-full text-left px-4 py-2 text-sm text-obsidian-text hover:bg-obsidian-accent hover:text-obsidian-strong"
                            >
                              Fix Grammar & Tone
                            </button>
                          </div>
                        </div>
                      </div>

                      {aiLoadingNoteId === note.id && (
                        <span className="text-xs text-obsidian-accent" title="AI is working">
                          Thinking...
                        </span>
                      )}
                      {aiErrorNoteId === note.id && (
                        <span className="text-xs text-red-400" title="AI request failed">
                          Failed
                        </span>
                      )}

                      <button
                        data-note-delete="true"
                        type="button"
                        className="shrink-0 text-obsidian-muted hover:text-red-400"
                        title="Delete note"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNote(note.id);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                      <div className="w-2 h-2 rounded-full bg-obsidian-accent" />
                    </div>
                  </div>

                  <div className="h-[calc(100%-2.5rem)] bg-obsidian-bg">
                    {/* Stop bubbling so text-selection double-clicks don't create new notes */}
                    <div className="h-full" onDoubleClick={(e) => e.stopPropagation()}>
                      <Editor
                        key={note.id}
                        variant="embedded"
                        content={note.content}
                        onChange={noteContentChangeHandlers[note.id]}
                        title={note.title}
                        onTitleChange={noteTitleChangeHandlers[note.id]}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-obsidian-border bg-obsidian-sidebar/80 backdrop-blur px-2 py-2">
          <button
            type="button"
            onClick={() => {
              if (!prevTarget) return;
              onJumpToNote(prevTarget.id);
            }}
            disabled={!prevTarget}
            className="px-3 py-1.5 rounded bg-obsidian-bg hover:bg-obsidian-active text-sm text-obsidian-text border border-obsidian-border disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous numbered note"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => {
              if (!nextTarget) return;
              onJumpToNote(nextTarget.id);
            }}
            disabled={!nextTarget}
            className="px-3 py-1.5 rounded bg-obsidian-bg hover:bg-obsidian-active text-sm text-obsidian-text border border-obsidian-border disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next numbered note"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
