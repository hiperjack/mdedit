import { store } from "./store";
import type { EditorHost } from "./editor";

function isModifier(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey;
}

function nextTabId(direction: 1 | -1): string | null {
  const { tabs, activeTabId } = store.getState();
  if (tabs.length === 0 || !activeTabId) return null;
  const idx = tabs.findIndex((t) => t.id === activeTabId);
  if (idx < 0) return null;
  const nextIdx = (idx + direction + tabs.length) % tabs.length;
  return tabs[nextIdx].id;
}

function tabIdAt(oneBasedIndex: number): string | null {
  const { tabs } = store.getState();
  const idx = oneBasedIndex - 1;
  if (idx < 0 || idx >= tabs.length) return null;
  return tabs[idx].id;
}

/**
 * キーボードショートカットを処理する。
 * WebView2 はメニュー accelerator を受け取らないことがあるため、
 * Ctrl+N/O/S/Shift+S/W といったファイル操作系もここで明示的に拾う。
 */
export function setupShortcuts(
  editor: EditorHost,
  fileActions: Record<string, () => void>,
): void {
  window.addEventListener(
    "keydown",
    (e) => {
      if (!isModifier(e)) return;

      // タブ移動
      if (e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        const id = nextTabId(-1);
        if (id) store.setActive(id);
        return;
      }
      if (!e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        const id = nextTabId(1);
        if (id) store.setActive(id);
        return;
      }
      if (!e.shiftKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const id = tabIdAt(parseInt(e.key, 10));
        if (id) store.setActive(id);
        return;
      }

      // ファイル操作（メニュー accelerator が届かないケース対策）
      const k = e.key.toLowerCase();
      if (e.shiftKey) {
        if (k === "s") {
          e.preventDefault();
          fileActions.file_save_as?.();
          return;
        }
        return;
      }
      if (k === "n") {
        e.preventDefault();
        fileActions.file_new?.();
        return;
      }
      if (k === "o") {
        e.preventDefault();
        fileActions.file_open?.();
        return;
      }
      if (k === "s") {
        e.preventDefault();
        fileActions.file_save?.();
        return;
      }
      if (k === "w") {
        e.preventDefault();
        fileActions.file_close?.();
        return;
      }

      void editor;
    },
    { capture: true },
  );
}
