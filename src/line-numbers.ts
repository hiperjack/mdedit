/**
 * ソースmarkdown相当の行番号ガター。
 *
 * - 行番号の単位はソース行（li/tr/コード行ごと）。視覚的折り返しでは増えない。
 * - ガター本体はスクロールコンテナ外（pane直下、固定位置）に配置し、
 *   内部ラッパに transform: translateY(-scrollTop) を当ててスクロールと同期する。
 *   これで WebView2 の絶対配置子要素のペイント不整合（残像）を回避する。
 */

const GUTTER_WIDTH = 44;

const HEADING_OR_P = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p"]);
const BLOCK_LIKE = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "ul",
  "ol",
  "table",
  "pre",
  "blockquote",
  "hr",
]);

export function attachLineNumbers(pane: HTMLElement): () => void {
  const gutter = document.createElement("div");
  gutter.className = "line-gutter";
  const inner = document.createElement("div");
  inner.className = "line-gutter-inner";
  gutter.appendChild(inner);
  pane.insertBefore(gutter, pane.firstChild);

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      update();
    });
  };

  const findPM = () => pane.querySelector<HTMLElement>(".ProseMirror");

  const update = () => {
    const pm = findPM();
    if (!pm) return;
    const paneRect = pane.getBoundingClientRect();
    const offset = pane.scrollTop - paneRect.top;
    const entries = collectEntries(pm, offset);
    render(inner, entries);
  };

  const onScroll = () => {
    // translate3d で GPU 合成レイヤを維持（残像対策）
    inner.style.transform = `translate3d(0, ${-pane.scrollTop}px, 0)`;
  };

  const ro = new ResizeObserver(schedule);
  const mo = new MutationObserver(schedule);
  const onResize = () => schedule();

  let started = false;
  const tryStart = () => {
    if (started) return;
    const pm = findPM();
    if (!pm) {
      requestAnimationFrame(tryStart);
      return;
    }
    started = true;
    ro.observe(pm);
    mo.observe(pm, { childList: true, subtree: true, characterData: true });
    pane.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    schedule();
    onScroll();
  };
  tryStart();

  return () => {
    ro.disconnect();
    mo.disconnect();
    pane.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    if (raf) cancelAnimationFrame(raf);
    gutter.remove();
  };
}

type Entry = { top: number; line: number; height: number };
type Ctx = { line: number };

function collectEntries(pm: HTMLElement, offset: number): Entry[] {
  const out: Entry[] = [];
  const ctx: Ctx = { line: 1 };

  const blocks = flattenTopLevel(pm);

  for (let i = 0; i < blocks.length; i++) {
    walkBlock(blocks[i], ctx, out, offset);
    if (i < blocks.length - 1) ctx.line += 1;
  }

  return out;
}

function flattenTopLevel(pm: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];

  const visit = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    if (rect.height === 0) return;

    if (isCodeBlock(el)) {
      out.push(el);
      return;
    }

    const tag = el.tagName.toLowerCase();

    if (BLOCK_LIKE.has(tag)) {
      if (HEADING_OR_P.has(tag) && isEmptyTextBlock(el)) return;
      out.push(el);
      return;
    }

    if (tag === "div" || tag === "section" || tag === "article") {
      Array.from(el.children).forEach((c) => visit(c as HTMLElement));
      return;
    }
  };

  Array.from(pm.children).forEach((c) => visit(c as HTMLElement));
  return out;
}

function isEmptyTextBlock(el: HTMLElement): boolean {
  const text = (el.textContent ?? "").replace(/​/g, "").trim();
  if (text !== "") return false;
  if (el.querySelector("br, img")) return false;
  return true;
}

function walkBlock(
  el: HTMLElement,
  ctx: Ctx,
  out: Entry[],
  offset: number,
): void {
  if (isCodeBlock(el)) {
    pushAt(out, el, ctx.line, offset);
    ctx.line++;
    el.querySelectorAll<HTMLElement>(".cm-line").forEach((cl) => {
      pushAt(out, cl, ctx.line, offset);
      ctx.line++;
    });
    ctx.line++;
    return;
  }

  const tag = el.tagName.toLowerCase();

  if (tag === "ul" || tag === "ol") {
    findListItems(el).forEach((li) => walkLi(li, ctx, out, offset));
    return;
  }

  if (tag === "table") {
    const trs = findTableRows(el);
    if (trs.length === 0) {
      pushAt(out, el, ctx.line, offset);
      ctx.line++;
      return;
    }
    pushAt(out, trs[0], ctx.line, offset);
    ctx.line++;
    ctx.line++;
    for (let i = 1; i < trs.length; i++) {
      pushAt(out, trs[i], ctx.line, offset);
      ctx.line++;
    }
    return;
  }

  if (tag === "blockquote") {
    Array.from(el.children).forEach((child) => {
      walkBlock(child as HTMLElement, ctx, out, offset);
    });
    return;
  }

  pushAt(out, el, ctx.line, offset);
  ctx.line++;
}

function walkLi(
  li: HTMLElement,
  ctx: Ctx,
  out: Entry[],
  offset: number,
): void {
  pushAt(out, li, ctx.line, offset);
  ctx.line++;
  Array.from(li.children).forEach((child) => {
    const tag = (child as HTMLElement).tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      walkBlock(child as HTMLElement, ctx, out, offset);
    }
  });
}

function findListItems(listEl: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  const visit = (el: HTMLElement) => {
    Array.from(el.children).forEach((c) => {
      const child = c as HTMLElement;
      const tag = child.tagName.toLowerCase();
      if (tag === "li") {
        out.push(child);
      } else if (tag === "div" || tag === "span") {
        visit(child);
      }
    });
  };
  visit(listEl);
  return out;
}

function findTableRows(tableEl: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  const thead = tableEl.querySelector<HTMLElement>("thead");
  if (thead) thead.querySelectorAll<HTMLElement>("tr").forEach((tr) => out.push(tr));
  const tbody = tableEl.querySelector<HTMLElement>("tbody");
  if (tbody) {
    tbody.querySelectorAll<HTMLElement>("tr").forEach((tr) => out.push(tr));
  } else if (!thead) {
    tableEl.querySelectorAll<HTMLElement>("tr").forEach((tr) => out.push(tr));
  }
  return out;
}

function pushAt(
  out: Entry[],
  el: HTMLElement,
  line: number,
  offset: number,
): void {
  const lineRect = getFirstLineRect(el);
  const rect = lineRect ?? el.getBoundingClientRect();
  if (rect.height === 0) return;
  out.push({
    top: Math.round(rect.top + offset),
    line,
    height: Math.max(1, Math.round(rect.height)),
  });
}

function getFirstLineRect(el: HTMLElement): DOMRect | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const text = node as Text;
    if (text.data.length > 0 && text.data.replace(/\s/g, "").length > 0) {
      const range = document.createRange();
      range.selectNodeContents(text);
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        if (rects[i].height > 0) return rects[i];
      }
    }
    node = walker.nextNode();
  }
  return null;
}

function isCodeBlock(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "pre") return true;
  if (el.classList.contains("cm-editor")) return true;
  if (el.querySelector(".cm-content") !== null) return true;
  return false;
}

function render(inner: HTMLElement, entries: Entry[]) {
  const existing = inner.children;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    let el = existing[i] as HTMLElement | undefined;
    if (!el) {
      el = document.createElement("div");
      el.className = "line-no";
      inner.appendChild(el);
    }
    if (el.dataset.top !== String(e.top)) {
      el.style.top = `${e.top}px`;
      el.dataset.top = String(e.top);
    }
    if (el.dataset.h !== String(e.height)) {
      el.style.height = `${e.height}px`;
      el.style.lineHeight = `${e.height}px`;
      el.dataset.h = String(e.height);
    }
    const label = String(e.line);
    if (el.textContent !== label) el.textContent = label;
  }
  while (inner.children.length > entries.length) {
    inner.lastElementChild?.remove();
  }
}

export const LINE_GUTTER_WIDTH = GUTTER_WIDTH;
