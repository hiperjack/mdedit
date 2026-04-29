import { commandsCtx, editorViewCtx, type CommandManager } from "@milkdown/kit/core";
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInHeadingCommand,
  createCodeBlockCommand,
  insertHrCommand,
  toggleLinkCommand,
} from "@milkdown/kit/preset/commonmark";
import { toggleStrikethroughCommand, insertTableCommand } from "@milkdown/kit/preset/gfm";

import type { EditorHost } from "./editor";
import { t, onLangChange } from "./i18n";

type Action = () => void;

type ButtonSpec = {
  /** ツールバー内で識別するキー（メニューイベントとも共通） */
  key: string;
  /** SVGの `d` 属性（24x24基準） */
  icon: string;
  /** i18n キー（"sep" の場合は空でもよい） */
  titleKey: string;
};

// Lucide由来の単純なSVGパス（24x24, stroke-based）
const ICONS: Record<string, string> = {
  bold: "M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6zM6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z",
  italic: "M19 4h-9M14 20H5M15 4 9 20",
  strike: "M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16",
  code: "m16 18 6-6-6-6M8 6l-6 6 6 6",
  h1: "M4 12h8M4 18V6M12 18V6M17 12l3-2v8",
  h2: "M4 12h8M4 18V6M12 18V6M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1",
  h3: "M4 12h8M4 18V6M12 18V6M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2M21 14a2 2 0 0 1-2 2c-1.5 0-3-.5-3.5-2",
  bullet: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  ordered: "M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1",
  quote: "M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1zM15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c1 0 1.25.25 1.25 1.25v.75c0 1-1 2-2 2s-1.008.008-1.008 1.031V20c0 1 .008 1 1.008 1z",
  codeblock:
    "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM10 9l-3 3 3 3M14 9l3 3-3 3",
  table:
    "M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  image:
    "M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8.5 11A1.5 1.5 0 1 1 7 9.5 1.5 1.5 0 0 1 8.5 11zM21 15l-5-5L5 21",
  hr: "M5 12h14",
};

const BUTTONS: ButtonSpec[] = [
  { key: "fmt_h1", icon: ICONS.h1, titleKey: "tb.h1" },
  { key: "fmt_h2", icon: ICONS.h2, titleKey: "tb.h2" },
  { key: "fmt_h3", icon: ICONS.h3, titleKey: "tb.h3" },
  { key: "sep", icon: "", titleKey: "" },
  { key: "fmt_bold", icon: ICONS.bold, titleKey: "tb.bold" },
  { key: "fmt_italic", icon: ICONS.italic, titleKey: "tb.italic" },
  { key: "fmt_strike", icon: ICONS.strike, titleKey: "tb.strike" },
  { key: "fmt_code", icon: ICONS.code, titleKey: "tb.code" },
  { key: "sep", icon: "", titleKey: "" },
  { key: "fmt_bullet", icon: ICONS.bullet, titleKey: "tb.bullet" },
  { key: "fmt_ordered", icon: ICONS.ordered, titleKey: "tb.ordered" },
  { key: "fmt_quote", icon: ICONS.quote, titleKey: "tb.quote" },
  { key: "fmt_codeblock", icon: ICONS.codeblock, titleKey: "tb.codeblock" },
  { key: "sep", icon: "", titleKey: "" },
  { key: "fmt_table", icon: ICONS.table, titleKey: "tb.table" },
  { key: "fmt_link", icon: ICONS.link, titleKey: "tb.link" },
  { key: "fmt_image", icon: ICONS.image, titleKey: "tb.image" },
  { key: "fmt_hr", icon: ICONS.hr, titleKey: "tb.hr" },
];

function svg(d: string): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

/**
 * ツールバーアクション。menuイベントとtoolbarクリックの両方から呼ばれる。
 */
export function makeToolbarActions(editor: EditorHost): Record<string, Action> {
  const run = (fn: (commands: CommandManager) => void) => {
    editor.runOnActive((ed) => {
      ed.action((ctx) => {
        fn(ctx.get(commandsCtx));
      });
    });
  };

  const promptLink = (cb: (href: string) => void) => {
    const url = window.prompt("リンク先URLを入力してください", "https://");
    if (!url) return;
    cb(url);
  };

  const promptImage = () => {
    const url = window.prompt("画像URLを入力してください", "https://");
    if (!url) return;
    const alt = window.prompt("代替テキスト（任意）", "") ?? "";
    editor.runOnActive((ed) => {
      ed.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const schema = view.state.schema;
        const imgType = schema.nodes.image;
        if (!imgType) return;
        const node = imgType.create({ src: url, alt });
        const tr = view.state.tr.replaceSelectionWith(node);
        view.dispatch(tr);
      });
    });
  };

  return {
    fmt_bold: () => run((c) => c.call(toggleStrongCommand.key)),
    fmt_italic: () => run((c) => c.call(toggleEmphasisCommand.key)),
    fmt_strike: () => run((c) => c.call(toggleStrikethroughCommand.key)),
    fmt_code: () => run((c) => c.call(toggleInlineCodeCommand.key)),
    fmt_h1: () => run((c) => c.call(wrapInHeadingCommand.key, 1)),
    fmt_h2: () => run((c) => c.call(wrapInHeadingCommand.key, 2)),
    fmt_h3: () => run((c) => c.call(wrapInHeadingCommand.key, 3)),
    fmt_bullet: () => run((c) => c.call(wrapInBulletListCommand.key)),
    fmt_ordered: () => run((c) => c.call(wrapInOrderedListCommand.key)),
    fmt_quote: () => run((c) => c.call(wrapInBlockquoteCommand.key)),
    fmt_codeblock: () => run((c) => c.call(createCodeBlockCommand.key)),
    fmt_table: () =>
      run((c) => c.call(insertTableCommand.key, { row: 3, col: 3 })),
    fmt_hr: () => run((c) => c.call(insertHrCommand.key)),
    fmt_link: () =>
      promptLink((href) =>
        run((c) => c.call(toggleLinkCommand.key, { href, title: "" })),
      ),
    fmt_image: () => promptImage(),
  };
}

export function createToolbar(
  parent: HTMLElement,
  actions: Record<string, Action>,
): void {
  parent.innerHTML = "";

  const titleUpdaters: Array<() => void> = [];

  for (const spec of BUTTONS) {
    if (spec.key === "sep") {
      const sep = document.createElement("span");
      sep.className = "toolbar-sep";
      parent.appendChild(sep);
      continue;
    }
    const btn = document.createElement("button");
    btn.className = "toolbar-btn";
    btn.title = t(spec.titleKey);
    btn.dataset.action = spec.key;
    btn.innerHTML = svg(spec.icon);
    btn.addEventListener("mousedown", (e) => {
      // ボタンクリック時にエディタのフォーカスを失わないよう preventDefault
      e.preventDefault();
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const fn = actions[spec.key];
      if (fn) fn();
    });
    parent.appendChild(btn);
    titleUpdaters.push(() => {
      btn.title = t(spec.titleKey);
    });
  }

  // 言語切替時にtooltipを更新
  onLangChange(() => {
    for (const fn of titleUpdaters) fn();
  });
}
