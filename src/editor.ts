import { Crepe } from "@milkdown/crepe";
import type { Editor } from "@milkdown/kit/core";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame-dark.css";

import { store, type Tab } from "./store";
import { attachLineNumbers } from "./line-numbers";

type EditorEntry = {
  tabId: string;
  container: HTMLElement;
  crepe: Crepe;
  /** 「未編集」の基準とするシリアライズ済みmarkdown */
  baseline: string;
  detachLineNumbers: () => void;
};

export type EditorHost = {
  /** タブを表示。エディタが未生成なら作成。他は隠す。 */
  show: (tab: Tab) => Promise<void>;
  /** タブを破棄（タブclose時のクリーンアップ）。 */
  destroy: (tabId: string) => Promise<void>;
  /** 現在のmarkdownを取得（保存用）。 */
  getMarkdown: (tabId: string) => string | null;
  /** baselineを現在のmarkdownにリセット（保存後）。 */
  resetBaseline: (tabId: string) => void;
  /** タブのエディタを作り直す（reload時）。 */
  recreate: (tab: Tab) => Promise<void>;
  /** アクティブタブのエディタにフォーカス。 */
  focus: () => void;
  /** アクティブタブのMilkdown Editorに対して操作を実行（toolbar/menu連携用）。 */
  runOnActive: (fn: (editor: Editor) => void) => void;
};

export function createEditorHost(root: HTMLElement): EditorHost {
  const editors = new Map<string, EditorEntry>();
  const pendingEditors = new Map<string, Promise<EditorEntry>>();

  // 非アクティブなペインを退避させる隠しコンテナ。
  // 同じスクロールコンテナの兄弟として並べておくと、WebView2が複数の
  // 合成レイヤを抱え込んで残像を出すことが分かったため、DOMごと隔離する。
  let park = document.getElementById("editor-pane-park") as HTMLElement | null;
  if (!park) {
    park = document.createElement("div");
    park.id = "editor-pane-park";
    document.body.appendChild(park);
  }
  const parkEl = park;

  const hideAll = (exceptTabId: string | null) => {
    for (const [id, entry] of editors) {
      const isActive = id === exceptTabId;
      const targetParent = isActive ? root : parkEl;
      if (entry.container.parentElement !== targetParent) {
        targetParent.appendChild(entry.container);
      }
    }
  };

  const destroyEntry = async (entry: EditorEntry) => {
    entry.detachLineNumbers();
    try {
      await entry.crepe.destroy();
    } catch (e) {
      console.warn("crepe.destroy failed:", e);
    }
    entry.container.remove();
  };

  const tabExists = (tabId: string) =>
    store.getState().tabs.some((tab) => tab.id === tabId);

  const getOrCreate = async (tab: Tab): Promise<EditorEntry> => {
    const existing = editors.get(tab.id);
    if (existing) return existing;

    let pending = pendingEditors.get(tab.id);
    if (!pending) {
      pending = make(tab)
        .then((entry) => {
          editors.set(tab.id, entry);
          return entry;
        })
        .finally(() => {
          pendingEditors.delete(tab.id);
        });
      pendingEditors.set(tab.id, pending);
    }

    return pending;
  };

  const focusActive = () => {
    const activeId = store.getActive()?.id ?? null;
    if (!activeId) return;
    const entry = editors.get(activeId);
    if (!entry) return;
    requestAnimationFrame(() => {
      const pm = entry.container.querySelector<HTMLElement>(".ProseMirror");
      pm?.focus();
    });
  };

  const make = async (tab: Tab): Promise<EditorEntry> => {
    const container = document.createElement("div");
    container.className = "editor-pane";
    container.dataset.tabId = tab.id;
    // park 側に先に置く。アクティブ化が必要なら呼び出し側がhideAll経由で
    // root に移動する。これで作成中の一瞬でも .editor-pane が #editor-host
    // 上に重ならない。
    parkEl.appendChild(container);

    const crepe = new Crepe({
      root: container,
      defaultValue: tab.diskContent,
      features: {
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.Toolbar]: false,
      },
    });

    await crepe.create();

    // 初期シリアライズ結果をbaselineとする（MarkText問題回避：
    //   生のファイル内容ではなくMilkdown正規化後の文字列を基準にする）
    const baseline = crepe.getMarkdown();

    const detachLineNumbers = attachLineNumbers(container);

    const entry: EditorEntry = {
      tabId: tab.id,
      container,
      crepe,
      baseline,
      detachLineNumbers,
    };

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        const isDirty = markdown !== entry.baseline;
        store.setDirty(tab.id, isDirty);
      });
    });

    return entry;
  };

  return {
    async show(tab: Tab) {
      const entry = await getOrCreate(tab);

      if (!tabExists(tab.id)) {
        editors.delete(tab.id);
        await destroyEntry(entry);
        return;
      }

      const activeId = store.getActive()?.id ?? null;
      hideAll(activeId);
      if (activeId === tab.id) {
        focusActive();
      }
    },

    async destroy(tabId: string) {
      const pending = pendingEditors.get(tabId);
      if (pending) {
        const entry = await pending;
        editors.delete(tabId);
        await destroyEntry(entry);
        return;
      }

      const entry = editors.get(tabId);
      if (!entry) return;
      editors.delete(tabId);
      await destroyEntry(entry);
    },

    getMarkdown(tabId: string) {
      const entry = editors.get(tabId);
      if (!entry) return null;
      return entry.crepe.getMarkdown();
    },

    resetBaseline(tabId: string) {
      const entry = editors.get(tabId);
      if (!entry) return;
      entry.baseline = entry.crepe.getMarkdown();
    },

    async recreate(tab: Tab) {
      const pending = pendingEditors.get(tab.id);
      if (pending) {
        const entry = await pending;
        editors.delete(tab.id);
        await destroyEntry(entry);
      }

      const old = editors.get(tab.id);
      if (old) {
        editors.delete(tab.id);
        await destroyEntry(old);
      }
      const fresh = await make(tab);
      editors.set(tab.id, fresh);
      const activeId = store.getActive()?.id ?? null;
      if (activeId === tab.id) {
        hideAll(activeId);
        focusActive();
      } else {
        hideAll(activeId);
      }
    },

    focus: focusActive,

    runOnActive(fn) {
      const id = store.getActive()?.id;
      if (!id) return;
      const entry = editors.get(id);
      if (!entry) return;
      // Crepe.editor は内部のMilkdown Editorインスタンス
      try {
        fn(entry.crepe.editor);
        // コマンド実行後はエディタにフォーカスを戻す
        const pm = entry.container.querySelector<HTMLElement>(".ProseMirror");
        pm?.focus();
      } catch (e) {
        console.error("runOnActive failed:", e);
      }
    },
  };
}
