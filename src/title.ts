import { getCurrentWindow } from "@tauri-apps/api/window";
import { store, type Tab } from "./store";

const APP_NAME = "mdedit";

function fileNameOf(tab: Tab): string {
  if (!tab.filePath) return "Untitled";
  const m = tab.filePath.split(/[\\/]/);
  return m[m.length - 1] || tab.filePath;
}

function isTauriContext(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function setupTitle(): void {
  const apply = () => {
    const active = store.getActive();
    let title: string;
    if (!active) {
      title = APP_NAME;
    } else {
      const dirtyMark = store.isDirty(active.id) ? "●" : "";
      title = `${dirtyMark}${fileNameOf(active)} - ${APP_NAME}`;
    }
    document.title = title;
    if (isTauriContext()) {
      // 失敗しても致命的ではないので握り潰す
      getCurrentWindow()
        .setTitle(title)
        .catch(() => {});
    }
  };

  store.subscribe(apply);
  apply();
}
