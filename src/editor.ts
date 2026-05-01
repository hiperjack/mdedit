import { Crepe } from "@milkdown/crepe";
import type { Editor } from "@milkdown/kit/core";
import {
  commandsCtx,
  editorViewCtx,
  prosePluginsCtx,
  remarkPluginsCtx,
  remarkStringifyOptionsCtx,
} from "@milkdown/kit/core";
import { keymap } from "@milkdown/kit/prose/keymap";
import { Plugin } from "@milkdown/kit/prose/state";
import { GapCursor } from "@milkdown/kit/prose/gapcursor";
import { exitCode } from "@milkdown/kit/prose/commands";
import type { EditorView } from "@milkdown/kit/prose/view";
import { insertHardbreakCommand } from "@milkdown/preset-commonmark";
import { keymap as cmKeymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import remarkBreaks from "remark-breaks";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame-dark.css";

import { store, type Tab } from "./store";
import { attachLineNumbers } from "./line-numbers";

/**
 * Smart Enter: Obsidian Live Preview に近い挙動にする。
 * - paragraph 内の Enter → hardbreak 挿入 (ソース上は1行追加)
 * - 直前が hardbreak なら paragraph 分割 (空行 + 新段落)
 * - list_item / code_block / heading / table 内はデフォルト挙動 (splitListItem 等)
 *
 * ProseMirror schema のノード名は preset-commonmark 準拠:
 *   - list_item, code_block (fence), heading, table*
 */
const SMART_ENTER_GUARD_NODES = new Set([
  "list_item",
  "code_block",
  "fence",
  "heading",
  "table",
  "table_row",
  "table_cell",
  "table_header",
]);

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

    // CodeMirror 内で Enter を 2 回連続押すとコードブロックから抜けて
     // 下に新しい段落を作る。1 回目はデフォルト (改行挿入)。
     // 検知: cursor が最終行の末尾、最終行が空、totalLines >= 2。
     let pmView: EditorView | null = null;
     // Prec.high で CM デフォルトの Enter (改行挿入) より先に呼ぶ
     const codeBlockExitKeymap = Prec.high(
       cmKeymap.of([
         {
           key: "Enter",
           run: (cm) => {
             const state = cm.state;
             const sel = state.selection.main;
             if (!sel.empty) return false;
             const head = sel.head;
             const lineAt = state.doc.lineAt(head);
             const totalLines = state.doc.lines;
             if (lineAt.number !== totalLines) return false;
             if (lineAt.text !== "") return false;
             if (totalLines < 2) return false;
             if (!pmView) return false;
             // 末尾の \n を消して、code block を抜ける
             cm.dispatch({
               changes: { from: head - 1, to: head, insert: "" },
             });
             const ok = exitCode(pmView.state, pmView.dispatch);
             if (ok) pmView.focus();
             return ok;
           },
         },
       ]),
     );

    const crepe = new Crepe({
      root: container,
      defaultValue: tab.diskContent,
      features: {
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.Toolbar]: false,
      },
      featureConfigs: {
        [Crepe.Feature.CodeMirror]: {
          extensions: [codeBlockExitKeymap],
        },
      },
    });

    // Smart Enter: paragraph 内では Enter で hardbreak (1行改行)、
    // 直前が hardbreak なら paragraph 分割 (空行 + 新段落)。
    // list/code/heading/table は既定挙動を尊重。
    //
    // また、remark-breaks を組み込み、ソース markdown の単一 \n を hardbreak
    // として解釈する (Obsidian Live Preview 風: ソース1行=表示1行)。
    // remark-stringify の break ハンドラも上書きして、保存時 hardbreak を
    // 単一 \n で出力する (\\\n マーカーを排除して見た目をクリーンに)。
    /*
      コードブロック / テーブル等の block-only ノード同士の間 (margin gap)
      をクリックしたとき、その位置に空段落を作って選択可能にする。
      ProseMirror の標準 gapcursor は visualcursor が薄く、Crepe の
      virtual-cursor との相性で常時クリック検出されないため、ここで
      明示的に handleClick で gap → 空段落挿入を行う。
     */
    const gapClickPlugin = new Plugin({
      props: {
        handleClick(view, pos, event) {
          // 空白エリアでクリックされた場合のみ動作
          // 1. クリック対象が ProseMirror 直下の "間" でないかチェック
          const target = event.target as HTMLElement;
          if (!target.classList.contains("ProseMirror")) return false;
          // 2. 親の前後の block を取得し、両者が空段落でない and pos が
          //    両者の境界にあるかどうか
          const $pos = view.state.doc.resolve(pos);
          // 親 doc レベルなら $pos.parent は doc。インデックスで前後 child を見る
          if ($pos.parent.type.name !== "doc") return false;
          const idx = $pos.index();
          const before = idx > 0 ? $pos.parent.child(idx - 1) : null;
          const after = idx < $pos.parent.childCount ? $pos.parent.child(idx) : null;
          // 隣接の少なくとも片方が text を直接受け付けない block (code, table,
          // hr) のときだけ空段落を差し込む。paragraph/heading 同士の間は
          // デフォルト挙動で十分 (隣接ブロックにフォーカスする)。
          const isBlockOnly = (n: typeof before) =>
            n != null &&
            (n.type.name === "code_block" ||
              n.type.name === "fence" ||
              n.type.name === "table" ||
              n.type.name === "horizontal_rule" ||
              n.type.name === "hr");
          if (!isBlockOnly(before) && !isBlockOnly(after)) {
            return false;
          }
          // GapCursor で空行に「カーソル位置だけ」を作る (空段落は挿入しない)。
          // ユーザーが文字入力した場合は ProseMirror が自動で paragraph を作る。
          const $pos2 = view.state.doc.resolve(pos);
          const tr = view.state.tr.setSelection(new GapCursor($pos2));
          view.dispatch(tr.scrollIntoView());
          return true;
        },
      },
    });

    crepe.editor.config((ctx) => {
      ctx.update(prosePluginsCtx, (plugins) => [
        gapClickPlugin,
        keymap({
          Enter: (state) => {
            // GapCursor (block 間のカーソル) では default 挙動 (paragraph 挿入)
            // に委譲する。ここで hardbreak を挿入すると不要な <br/> が混入する。
            if (state.selection instanceof GapCursor) return false;
            const { $from } = state.selection;
            for (let d = $from.depth; d > 0; d--) {
              const name = $from.node(d).type.name;
              if (SMART_ENTER_GUARD_NODES.has(name)) return false;
            }
            // 空段落での Enter は默認の splitBlock に委譲して、
            // 連続 Enter で末尾に空段落を追加できるようにする。
            // (insertHardbreakCommand は空段落 → hardbreak → 直前 hardbreak
            // 検出で paragraph 化、というループになり段落が増えない。)
            const parent = $from.parent;
            if (
              parent.type.name === "paragraph" &&
              parent.content.size === 0
            ) {
              return false;
            }
            const commands = ctx.get(commandsCtx);
            return commands.call(insertHardbreakCommand.key);
          },
        }),
        ...plugins,
      ]);
      ctx.update(remarkPluginsCtx, (plugins) => [
        ...plugins,
        { plugin: remarkBreaks, options: {} },
      ]);
      ctx.update(remarkStringifyOptionsCtx, (opts) => ({
        ...opts,
        // 箇条書きと水平線は `-` を使う (Marktext / Obsidian デフォルト)
        bullet: "-" as const,
        rule: "-" as const,
        handlers: {
          ...opts.handlers,
          // hardbreak は \\\n でなく単一 \n で出力
          break: () => "\n",
        },
        // ブロック間の連結を制御 (Obsidian Live Preview 風)
        //   - hr / code block: 前後に空行 (1)
        //   - heading が片方: 空行なし (0)。連続見出しや見出し直後の本文を密に。
        //   - paragraph ↔ paragraph: 空行 (1) を維持。段落区切りの視認性。
        //   - その他: 空行なし (0)
        join: [
          (left, right) => {
            // 常に空行: hr (thematic break) の前後、table の前後、
            // 連続する code block 同士、blockquote の直後。
            // 段落間 (paragraph→paragraph) は空行で区切る。
            // それ以外 (heading↔他、paragraph→code 等) は隣接 (空行なし)。
            const types = [left.type, right.type];
            if (types.includes("thematicBreak")) return 1;
            if (types.includes("table")) return 1;
            if (left.type === "code" && right.type === "code") return 1;
            if (left.type === "blockquote") return 1;
            if (left.type === "paragraph" && right.type === "paragraph")
              return 1;
            return 0;
          },
          ...(opts.join ?? []),
        ],
      }));
    });

    await crepe.create();

    // CodeMirror keymap closure 用に PM view 参照を取得
    crepe.editor.action((ctx) => {
      pmView = ctx.get(editorViewCtx) as EditorView;
    });

    // 初期シリアライズ結果をbaselineとする（MarkText問題回避：
    //   生のファイル内容ではなくMilkdown正規化後の文字列を基準にする）
    const baseline = crepe.getMarkdown();

    const detachLineNumbers = attachLineNumbers(container, () =>
      crepe.getMarkdown(),
    );

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
