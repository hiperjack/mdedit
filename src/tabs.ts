import Sortable from "sortablejs";
import { store, type Tab } from "./store";

export type TabBarHandlers = {
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNew: () => void;
};

function fileNameOf(tab: Tab): string {
  if (!tab.filePath) return "Untitled";
  const m = tab.filePath.split(/[\\/]/);
  return m[m.length - 1] || tab.filePath;
}

export function createTabBar(
  parent: HTMLElement,
  handlers: TabBarHandlers,
): void {
  parent.innerHTML = "";

  const list = document.createElement("div");
  list.className = "tab-list";
  parent.appendChild(list);

  const newBtn = document.createElement("button");
  newBtn.className = "tab-new-btn";
  newBtn.title = "新規タブ (Ctrl+N)";
  newBtn.textContent = "+";
  newBtn.addEventListener("click", () => handlers.onNew());
  parent.appendChild(newBtn);

  Sortable.create(list, {
    animation: 150,
    draggable: ".tab",
    onEnd: (evt) => {
      if (
        typeof evt.oldIndex === "number" &&
        typeof evt.newIndex === "number" &&
        evt.oldIndex !== evt.newIndex
      ) {
        store.reorder(evt.oldIndex, evt.newIndex);
      }
    },
  });

  const render = () => {
    const { tabs, activeTabId } = store.getState();
    list.innerHTML = "";

    for (const tab of tabs) {
      const el = document.createElement("div");
      el.className = "tab";
      el.dataset.tabId = tab.id;
      if (tab.id === activeTabId) el.classList.add("active");
      const dirty = store.isDirty(tab.id);
      if (dirty) el.classList.add("dirty");

      const dot = document.createElement("span");
      dot.className = "tab-dirty-dot";
      dot.textContent = dirty ? "●" : "";
      el.appendChild(dot);

      const label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = fileNameOf(tab);
      label.title = tab.filePath ?? "Untitled";
      el.appendChild(label);

      const closeBtn = document.createElement("button");
      closeBtn.className = "tab-close";
      closeBtn.textContent = "×";
      closeBtn.title = "閉じる";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handlers.onClose(tab.id);
      });
      el.appendChild(closeBtn);

      el.addEventListener("click", () => {
        handlers.onSelect(tab.id);
      });

      el.addEventListener("auxclick", (e) => {
        if (e.button === 1) {
          e.preventDefault();
          handlers.onClose(tab.id);
        }
      });

      el.addEventListener("mousedown", (e) => {
        if (e.button === 1) e.preventDefault();
      });

      list.appendChild(el);
    }
  };

  store.subscribe(render);
  render();
}
