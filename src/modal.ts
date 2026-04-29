type ButtonKind = "primary" | "default" | "danger";

type ButtonSpec<T extends string> = {
  label: string;
  value: T;
  kind?: ButtonKind;
};

function showModal<T extends string>(opts: {
  title: string;
  body: string;
  buttons: ButtonSpec<T>[];
  defaultValue: T;
}): Promise<T> {
  return new Promise((resolve) => {
    const root = document.getElementById("modal-root");
    if (!root) {
      resolve(opts.defaultValue);
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const dialog = document.createElement("div");
    dialog.className = "modal-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const titleEl = document.createElement("div");
    titleEl.className = "modal-title";
    titleEl.textContent = opts.title;

    const bodyEl = document.createElement("div");
    bodyEl.className = "modal-body";
    bodyEl.textContent = opts.body;

    const btnRow = document.createElement("div");
    btnRow.className = "modal-buttons";

    let resolved = false;
    const finish = (value: T) => {
      if (resolved) return;
      resolved = true;
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      resolve(value);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish(opts.defaultValue);
      } else if (e.key === "Enter") {
        const primary = opts.buttons.find((b) => b.kind === "primary");
        if (primary) {
          e.preventDefault();
          e.stopPropagation();
          finish(primary.value);
        }
      }
    };

    for (const spec of opts.buttons) {
      const btn = document.createElement("button");
      btn.className = `modal-btn modal-btn-${spec.kind ?? "default"}`;
      btn.textContent = spec.label;
      btn.addEventListener("click", () => finish(spec.value));
      btnRow.appendChild(btn);
    }

    dialog.appendChild(titleEl);
    dialog.appendChild(bodyEl);
    dialog.appendChild(btnRow);
    overlay.appendChild(dialog);
    root.appendChild(overlay);

    document.addEventListener("keydown", onKey, true);

    const primaryBtn = btnRow.querySelector<HTMLButtonElement>(
      ".modal-btn-primary",
    );
    (primaryBtn ?? btnRow.querySelector("button"))?.focus();
  });
}

export type SaveChoice = "save" | "discard" | "cancel";

export function confirmSave(filename: string): Promise<SaveChoice> {
  return showModal<SaveChoice>({
    title: "保存しますか？",
    body: `${filename} には未保存の変更があります。`,
    buttons: [
      { label: "保存", value: "save", kind: "primary" },
      { label: "破棄", value: "discard", kind: "danger" },
      { label: "キャンセル", value: "cancel" },
    ],
    defaultValue: "cancel",
  });
}

export type DuplicateChoice = "switch" | "reload" | "cancel";

export function confirmDuplicate(filename: string): Promise<DuplicateChoice> {
  return showModal<DuplicateChoice>({
    title: "すでに開いています",
    body: `${filename} はすでに開かれています。どうしますか？`,
    buttons: [
      { label: "そのタブに切替", value: "switch", kind: "primary" },
      { label: "破棄して開き直す", value: "reload", kind: "danger" },
      { label: "キャンセル", value: "cancel" },
    ],
    defaultValue: "cancel",
  });
}

export type CloseAllChoice = "discard" | "cancel" | "review";

export function confirmCloseAll(): Promise<CloseAllChoice> {
  return showModal<CloseAllChoice>({
    title: "未保存の変更があります",
    body: "未保存のタブがあります。どうしますか？",
    buttons: [
      { label: "確認する", value: "review", kind: "primary" },
      { label: "破棄して終了", value: "discard", kind: "danger" },
      { label: "キャンセル", value: "cancel" },
    ],
    defaultValue: "cancel",
  });
}
