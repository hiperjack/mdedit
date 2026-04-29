import { settings, FONT_PRESETS } from "./settings";
import { LANG_OPTIONS, type Lang, t } from "./i18n";

type SectionKey = "font" | "display" | "language";

export function openFontSettings(): Promise<void> {
  return new Promise((resolve) => {
    const root = document.getElementById("modal-root");
    if (!root) {
      resolve();
      return;
    }

    const before = settings.get();
    // 編集中の値（Apply時に確定）
    const draft = {
      fontFamily: before.fontFamily,
      fontSize: before.fontSize,
      showRecent: before.showRecent,
      lang: before.lang as Lang,
    };

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const dialog = document.createElement("div");
    dialog.className = "modal-dialog settings-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const title = document.createElement("div");
    title.className = "modal-title";
    title.textContent = t("settings.title");
    dialog.appendChild(title);

    // ── レイアウト：左ナビ + 右パネル ────────────────────
    const layout = document.createElement("div");
    layout.className = "settings-layout";

    const nav = document.createElement("div");
    nav.className = "settings-nav";

    const panelHost = document.createElement("div");
    panelHost.className = "settings-panel";

    layout.appendChild(nav);
    layout.appendChild(panelHost);
    dialog.appendChild(layout);

    const sections: { key: SectionKey; labelKey: string }[] = [
      { key: "font", labelKey: "settings.section.font" },
      { key: "display", labelKey: "settings.section.display" },
      { key: "language", labelKey: "settings.section.language" },
    ];

    let active: SectionKey = "font";
    const navButtons = new Map<SectionKey, HTMLElement>();

    const renderActive = () => {
      panelHost.innerHTML = "";
      panelHost.appendChild(buildPanel(active));
      for (const [k, btn] of navButtons) {
        btn.classList.toggle("active", k === active);
      }
    };

    for (const s of sections) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-nav-item";
      btn.textContent = t(s.labelKey);
      btn.addEventListener("click", () => {
        active = s.key;
        renderActive();
      });
      navButtons.set(s.key, btn);
      nav.appendChild(btn);
    }

    function buildPanel(key: SectionKey): HTMLElement {
      const wrap = document.createElement("div");
      wrap.className = "settings-panel-body";
      if (key === "font") wrap.appendChild(buildFontPanel());
      else if (key === "display") wrap.appendChild(buildDisplayPanel());
      else wrap.appendChild(buildLanguagePanel());
      return wrap;
    }

    function buildFontPanel(): HTMLElement {
      const c = document.createElement("div");

      const fontRow = document.createElement("label");
      fontRow.className = "settings-row";
      const fontSpan = document.createElement("span");
      fontSpan.textContent = t("settings.font.family");
      fontRow.appendChild(fontSpan);
      const fontSelect = document.createElement("select");
      fontSelect.className = "settings-input";
      let matchedPreset = false;
      for (const preset of FONT_PRESETS) {
        const opt = document.createElement("option");
        opt.value = preset.value;
        opt.textContent = preset.label;
        if (preset.value === draft.fontFamily) {
          opt.selected = true;
          matchedPreset = true;
        }
        fontSelect.appendChild(opt);
      }
      if (!matchedPreset) {
        const opt = document.createElement("option");
        opt.value = draft.fontFamily;
        opt.textContent = `（カスタム）${draft.fontFamily}`;
        opt.selected = true;
        fontSelect.insertBefore(opt, fontSelect.firstChild);
      }
      fontSelect.addEventListener("change", () => {
        draft.fontFamily = fontSelect.value;
        updatePreview();
      });
      fontRow.appendChild(fontSelect);
      c.appendChild(fontRow);

      const sizeRow = document.createElement("label");
      sizeRow.className = "settings-row";
      const sizeSpan = document.createElement("span");
      sizeSpan.textContent = t("settings.font.size");
      sizeRow.appendChild(sizeSpan);
      const sizeInput = document.createElement("input");
      sizeInput.type = "number";
      sizeInput.min = "8";
      sizeInput.max = "48";
      sizeInput.step = "1";
      sizeInput.value = String(draft.fontSize);
      sizeInput.className = "settings-input";
      sizeInput.addEventListener("input", () => {
        const n = parseInt(sizeInput.value, 10);
        if (Number.isFinite(n)) draft.fontSize = n;
        updatePreview();
      });
      sizeRow.appendChild(sizeInput);
      c.appendChild(sizeRow);

      const preview = document.createElement("div");
      preview.className = "settings-preview";
      preview.textContent = t("settings.font.preview");
      c.appendChild(preview);

      function updatePreview() {
        preview.style.fontFamily = draft.fontFamily;
        preview.style.fontSize = `${draft.fontSize}px`;
      }
      updatePreview();

      return c;
    }

    function buildDisplayPanel(): HTMLElement {
      const c = document.createElement("div");

      const row = document.createElement("label");
      row.className = "settings-row settings-row-checkbox";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = draft.showRecent;
      check.className = "settings-input";
      check.addEventListener("change", () => {
        draft.showRecent = check.checked;
      });
      const text = document.createElement("span");
      text.textContent = t("settings.display.showRecent");
      row.appendChild(check);
      row.appendChild(text);
      c.appendChild(row);

      return c;
    }

    function buildLanguagePanel(): HTMLElement {
      const c = document.createElement("div");

      const row = document.createElement("label");
      row.className = "settings-row";
      const span = document.createElement("span");
      span.textContent = t("settings.language.select");
      row.appendChild(span);
      const select = document.createElement("select");
      select.className = "settings-input";
      for (const opt of LANG_OPTIONS) {
        const o = document.createElement("option");
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === draft.lang) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener("change", () => {
        draft.lang = select.value as Lang;
      });
      row.appendChild(select);
      c.appendChild(row);

      const note = document.createElement("div");
      note.className = "settings-note";
      note.textContent = t("settings.language.note");
      c.appendChild(note);

      return c;
    }

    renderActive();

    // ── ボタン群 ───────────────────────────────────────
    const btnRow = document.createElement("div");
    btnRow.className = "modal-buttons";

    const resetBtn = document.createElement("button");
    resetBtn.className = "modal-btn";
    resetBtn.textContent = t("settings.button.reset");
    resetBtn.addEventListener("click", () => {
      draft.fontFamily = FONT_PRESETS[0].value;
      draft.fontSize = 15;
      draft.showRecent = true;
      draft.lang = "ja";
      renderActive();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "modal-btn";
    cancelBtn.textContent = t("settings.button.cancel");

    const okBtn = document.createElement("button");
    okBtn.className = "modal-btn modal-btn-primary";
    okBtn.textContent = t("settings.button.apply");

    btnRow.appendChild(resetBtn);
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    dialog.appendChild(btnRow);

    overlay.appendChild(dialog);
    root.appendChild(overlay);

    let resolved = false;
    const close = () => {
      if (resolved) return;
      resolved = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === "Enter") {
        const tag = (document.activeElement as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "SELECT") return;
        e.preventDefault();
        e.stopPropagation();
        apply();
      }
    };

    const apply = () => {
      settings.setFontFamily(draft.fontFamily);
      settings.setFontSize(draft.fontSize);
      settings.setShowRecent(draft.showRecent);
      settings.setLang(draft.lang);
      close();
    };

    cancelBtn.addEventListener("click", close);
    okBtn.addEventListener("click", apply);

    document.addEventListener("keydown", onKey, true);
    okBtn.focus();
  });
}
