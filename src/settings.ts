export type FontPreset = {
  /** 表示名 */
  label: string;
  /** CSS font-family 値 */
  value: string;
};

/**
 * 日本語環境で使いやすいフォントの候補。
 * 値はCSS font-family 文字列そのまま。
 */
export const FONT_PRESETS: FontPreset[] = [
  {
    label: "システム既定",
    value:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Yu Gothic UI', Meiryo, sans-serif",
  },
  {
    label: "Yu Gothic UI（游ゴシック）",
    value: "'Yu Gothic UI', 'Yu Gothic', YuGothic, sans-serif",
  },
  { label: "Meiryo（メイリオ）", value: "Meiryo, sans-serif" },
  {
    label: "MS P ゴシック",
    value: "'MS PGothic', 'MS Gothic', sans-serif",
  },
  {
    label: "Noto Sans JP",
    value: "'Noto Sans JP', 'Noto Sans CJK JP', sans-serif",
  },
  {
    label: "Yu Mincho（游明朝）",
    value: "'Yu Mincho', YuMincho, 'Hiragino Mincho ProN', serif",
  },
  { label: "MS P 明朝", value: "'MS PMincho', 'MS Mincho', serif" },
  {
    label: "Cascadia Code（等幅）",
    value: "'Cascadia Code', 'Cascadia Mono', Consolas, monospace",
  },
  { label: "Consolas（等幅）", value: "Consolas, 'Courier New', monospace" },
];

import type { Lang } from "./i18n";

export type Settings = {
  fontFamily: string;
  fontSize: number;
  showRecent: boolean;
  lang: Lang;
};

const DEFAULT_SETTINGS: Settings = {
  fontFamily: FONT_PRESETS[0].value,
  fontSize: 15,
  showRecent: true,
  lang: "ja",
};

const MIN_SIZE = 8;
const MAX_SIZE = 48;
const STORAGE_KEY = "mdedit.settings.v1";

function loadFromStorage(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      fontFamily:
        typeof parsed.fontFamily === "string" && parsed.fontFamily
          ? parsed.fontFamily
          : DEFAULT_SETTINGS.fontFamily,
      fontSize:
        typeof parsed.fontSize === "number" && Number.isFinite(parsed.fontSize)
          ? clampSize(parsed.fontSize)
          : DEFAULT_SETTINGS.fontSize,
      showRecent:
        typeof parsed.showRecent === "boolean"
          ? parsed.showRecent
          : DEFAULT_SETTINGS.showRecent,
      lang:
        parsed.lang === "ja" || parsed.lang === "en"
          ? parsed.lang
          : DEFAULT_SETTINGS.lang,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveToStorage(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // localStorage不可（プライベートモード等）の場合は黙って無視
  }
}

function clampSize(n: number): number {
  return Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(n)));
}

let current: Settings = loadFromStorage();
const listeners = new Set<(s: Settings) => void>();

function applyToDom(): void {
  const root = document.documentElement;
  root.style.setProperty("--editor-font-family", current.fontFamily);
  root.style.setProperty("--editor-font-size", `${current.fontSize}px`);
}

function notify(): void {
  for (const fn of listeners) fn(current);
}

export const settings = {
  get(): Settings {
    return { ...current };
  },

  setFontFamily(v: string): void {
    if (!v || v === current.fontFamily) return;
    current = { ...current, fontFamily: v };
    saveToStorage(current);
    applyToDom();
    notify();
  },

  setFontSize(v: number): void {
    const next = clampSize(v);
    if (next === current.fontSize) return;
    current = { ...current, fontSize: next };
    saveToStorage(current);
    applyToDom();
    notify();
  },

  changeFontSize(delta: number): void {
    settings.setFontSize(current.fontSize + delta);
  },

  resetFontSize(): void {
    settings.setFontSize(DEFAULT_SETTINGS.fontSize);
  },

  setShowRecent(v: boolean): void {
    if (v === current.showRecent) return;
    current = { ...current, showRecent: v };
    saveToStorage(current);
    notify();
  },

  setLang(v: Lang): void {
    if (v === current.lang) return;
    current = { ...current, lang: v };
    saveToStorage(current);
    notify();
  },

  subscribe(fn: (s: Settings) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** ブートストラップ時に1回呼ぶ。 */
  init(): void {
    applyToDom();
  },
};
