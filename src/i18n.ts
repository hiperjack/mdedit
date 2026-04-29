/**
 * 軽量な多言語対応。
 * 現状はフロントUI（設定モーダル、ツールバーtooltip）のみカバーする。
 * メニューバー（Rust側）は別途翻訳が必要。
 */

export type Lang = "ja" | "en";

const DICT: Record<Lang, Record<string, string>> = {
  ja: {
    // 設定モーダル
    "settings.title": "設定",
    "settings.section.font": "フォント",
    "settings.section.display": "表示",
    "settings.section.language": "言語",
    "settings.font.family": "フォント",
    "settings.font.size": "文字サイズ (px)",
    "settings.font.preview": "プレビュー: あいうえお ABCDE 12345",
    "settings.display.showRecent": "最近使ったファイルをメニューに表示",
    "settings.language.select": "表示言語",
    "settings.language.note":
      "確認ダイアログ等、一部のテキストは未対応のため日本語のままになることがあります。",
    "settings.button.cancel": "キャンセル",
    "settings.button.apply": "適用",
    "settings.button.reset": "デフォルトに戻す",
    // ツールバー tooltip
    "tb.h1": "見出し1",
    "tb.h2": "見出し2",
    "tb.h3": "見出し3",
    "tb.bold": "太字 (Ctrl+B)",
    "tb.italic": "斜体 (Ctrl+I)",
    "tb.strike": "取り消し線 (Ctrl+Shift+X)",
    "tb.code": "インラインコード (Ctrl+E)",
    "tb.bullet": "箇条書きリスト",
    "tb.ordered": "番号付きリスト",
    "tb.quote": "引用",
    "tb.codeblock": "コードブロック",
    "tb.table": "表を挿入",
    "tb.link": "リンク (Ctrl+K)",
    "tb.image": "画像",
    "tb.hr": "区切り線",
  },
  en: {
    "settings.title": "Settings",
    "settings.section.font": "Font",
    "settings.section.display": "Display",
    "settings.section.language": "Language",
    "settings.font.family": "Font family",
    "settings.font.size": "Font size (px)",
    "settings.font.preview": "Preview: The quick brown fox 12345",
    "settings.display.showRecent": "Show recent files in menu",
    "settings.language.select": "Language",
    "settings.language.note":
      "Some prompts (e.g. unsaved-changes dialogs) are not yet translated and remain in Japanese.",
    "settings.button.cancel": "Cancel",
    "settings.button.apply": "Apply",
    "settings.button.reset": "Reset to defaults",
    "tb.h1": "Heading 1",
    "tb.h2": "Heading 2",
    "tb.h3": "Heading 3",
    "tb.bold": "Bold (Ctrl+B)",
    "tb.italic": "Italic (Ctrl+I)",
    "tb.strike": "Strikethrough (Ctrl+Shift+X)",
    "tb.code": "Inline code (Ctrl+E)",
    "tb.bullet": "Bulleted list",
    "tb.ordered": "Numbered list",
    "tb.quote": "Quote",
    "tb.codeblock": "Code block",
    "tb.table": "Insert table",
    "tb.link": "Link (Ctrl+K)",
    "tb.image": "Image",
    "tb.hr": "Horizontal rule",
  },
};

export const LANG_OPTIONS: { value: Lang; label: string }[] = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
];

let currentLang: Lang = "ja";
const listeners = new Set<(lang: Lang) => void>();

export function setLang(lang: Lang): void {
  if (lang === currentLang) return;
  currentLang = lang;
  for (const fn of listeners) fn(lang);
}

export function getLang(): Lang {
  return currentLang;
}

export function t(key: string): string {
  return DICT[currentLang][key] ?? DICT.ja[key] ?? key;
}

export function onLangChange(fn: (lang: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
