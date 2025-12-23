export interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
  frameId?: string | null;
}

export interface Frame {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  updatedAt: number;
}

export interface WhiteboardItem {
  id: string;
  noteId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

export interface WhiteboardBoard {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface SearchResult {
  item: Note;
  score?: number;
}

export enum ViewMode {
  EDITOR = 'EDITOR',
  PREVIEW = 'PREVIEW',
}
