export interface Note {
  id: string;
  title: string;
  content: string;
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

export interface SearchResult {
  item: Note;
  score?: number;
}

export enum ViewMode {
  EDITOR = 'EDITOR',
  PREVIEW = 'PREVIEW'
}
