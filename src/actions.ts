import { invoke } from "@tauri-apps/api/core";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { store, type Tab } from "./store";
import { confirmSave, confirmDuplicate } from "./modal";
import type { EditorHost } from "./editor";

const MD_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown"] },
  { name: "All Files", extensions: ["*"] },
];

function isTauriContext(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function fileNameOf(tab: Tab): string {
  if (!tab.filePath) return "Untitled";
  const m = tab.filePath.split(/[\\/]/);
  return m[m.length - 1] || tab.filePath;
}

async function writeFile(path: string, content: string): Promise<void> {
  await invoke<void>("write_file", { path, content });
}

async function readFile(path: string): Promise<string> {
  return await invoke<string>("read_file", { path });
}

async function addRecent(path: string): Promise<void> {
  try {
    await invoke<void>("add_recent_file", { path });
  } catch (e) {
    console.warn("add_recent_file failed:", e);
  }
}

export async function saveTab(
  tabId: string,
  editor: EditorHost,
): Promise<boolean> {
  if (!isTauriContext()) {
    console.warn("saveTab: Tauri context not available");
    return false;
  }
  const tab = store.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return false;

  const markdown = editor.getMarkdown(tabId);
  if (markdown === null) return false;

  let path = tab.filePath;
  if (!path) {
    const picked = await saveDialog({
      title: "名前を付けて保存",
      filters: MD_FILTERS,
      defaultPath: "Untitled.md",
    });
    if (!picked) return false;
    path = picked;
  }

  await writeFile(path, markdown);
  store.markSaved(tabId, path, markdown);
  editor.resetBaseline(tabId);
  void addRecent(path);
  return true;
}

export async function saveTabAs(
  tabId: string,
  editor: EditorHost,
): Promise<boolean> {
  if (!isTauriContext()) return false;
  const tab = store.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return false;

  const markdown = editor.getMarkdown(tabId);
  if (markdown === null) return false;

  const picked = await saveDialog({
    title: "名前を付けて保存",
    filters: MD_FILTERS,
    defaultPath: tab.filePath ?? "Untitled.md",
  });
  if (!picked) return false;

  await writeFile(picked, markdown);
  store.markSaved(tabId, picked, markdown);
  editor.resetBaseline(tabId);
  void addRecent(picked);
  return true;
}

export async function openFileFromDialog(editor: EditorHost): Promise<void> {
  if (!isTauriContext()) return;
  const picked = await openDialog({
    title: "ファイルを開く",
    filters: MD_FILTERS,
    multiple: false,
    directory: false,
  });
  if (!picked || typeof picked !== "string") return;
  const content = await readFile(picked);
  await openOrSwitch(picked, content, editor);
}

/**
 * ファイルパスと内容を受けて、既存タブがあれば切替/開き直し、なければ新規タブを作る。
 * 起動直後の空タブを置き換える特殊処理も含む。
 */
export async function openOrSwitch(
  path: string,
  content: string,
  editor: EditorHost,
): Promise<void> {
  void addRecent(path);
  const existing = store.findByPath(path);
  if (existing) {
    if (!store.isDirty(existing.id) && existing.diskContent === content) {
      // 編集なし & 外部変更なし → 単に切替
      store.setActive(existing.id);
      const a = store.getActive();
      if (a) await editor.show(a);
      return;
    }
    const choice = await confirmDuplicate(fileNameOf(existing));
    if (choice === "cancel") return;
    if (choice === "switch") {
      store.setActive(existing.id);
      const a = store.getActive();
      if (a) await editor.show(a);
      return;
    }
    // reload: ストアを更新してエディタを作り直す
    store.setDiskContent(existing.id, content);
    store.setActive(existing.id);
    const tab = store.getActive();
    if (tab) {
      await editor.recreate(tab);
    }
    return;
  }

  // 起動直後の空タブを置き換え
  const { tabs } = store.getState();
  if (
    tabs.length === 1 &&
    tabs[0].filePath === null &&
    tabs[0].diskContent === "" &&
    !store.isDirty(tabs[0].id)
  ) {
    const id = tabs[0].id;
    // 既存の空エディタは破棄して新内容で作り直す
    await editor.destroy(id);
    store.markSaved(id, path, content);
    const tab = store.getState().tabs.find((t) => t.id === id);
    if (tab) {
      await editor.show(tab);
    }
    return;
  }

  // 新規タブで開く
  store.addTab({ filePath: path, content });
  const a = store.getActive();
  if (a) await editor.show(a);
}

/**
 * タブを閉じる。dirtyなら保存確認。
 */
export async function closeTab(
  tabId: string,
  editor: EditorHost,
): Promise<void> {
  const tab = store.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return;

  if (store.isDirty(tabId)) {
    const choice = await confirmSave(fileNameOf(tab));
    if (choice === "cancel") return;
    if (choice === "save") {
      const ok = await saveTab(tabId, editor);
      if (!ok) return;
    }
  }
  await editor.destroy(tabId);
  store.removeTab(tabId);
  // 残タブのアクティブをエディタに反映
  const a = store.getActive();
  if (a) await editor.show(a);
}

export async function newTab(editor: EditorHost): Promise<void> {
  store.addTab();
  const a = store.getActive();
  if (a) await editor.show(a);
}
