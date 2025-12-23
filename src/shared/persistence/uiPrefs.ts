export type AppTheme = 'dark' | 'light';

const THEME_KEY = 'whiteboard-note_theme';
const SIDEBAR_OPEN_KEY = 'whiteboard-note_sidebar_open';
const CHAT_OPEN_KEY = 'whiteboard-note_chat_open';

export const getThemePreference = (): AppTheme => {
  if (typeof window === 'undefined') return 'dark';
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    return raw === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

export const setThemePreference = (theme: AppTheme) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
};

export const getSidebarOpenPreference = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_OPEN_KEY);
    if (raw == null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
};

export const setSidebarOpenPreference = (isOpen: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SIDEBAR_OPEN_KEY, String(isOpen));
  } catch {
    // ignore
  }
};

export const getChatOpenPreference = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(CHAT_OPEN_KEY);
    if (raw == null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
};

export const setChatOpenPreference = (isOpen: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHAT_OPEN_KEY, String(isOpen));
  } catch {
    // ignore
  }
};
