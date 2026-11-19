import { IS_MAC } from "@/platform";
import { isWorkingCopy, useGraphStore } from "@/store/graph";
import { useSelectionStore } from "@/store/selection";
import { useTerminalStore } from "@/store/terminal";

export const MOD = IS_MAC ? "⌘" : "Ctrl";

const hasMod = (e: KeyboardEvent) => (IS_MAC ? e.metaKey : e.ctrlKey);

const TERMINAL = "[data-terminal]";

const inTerminal = (target: EventTarget | null) => target instanceof Element && target.closest(TERMINAL) !== null;

function isTyping(target: EventTarget | null) {
  return (
    inTerminal(target) ||
    (target instanceof HTMLElement &&
      (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
  );
}

type Pane = "graph" | "terminal" | "history";

const FOCUS_KEY: Record<string, Pane> = {
  Digit1: "graph",
  Digit2: "terminal",
  Digit3: "history",
};

function focusPane(pane: Pane) {
  const terminal = useTerminalStore.getState();
  if (pane === "terminal") return terminal.focusTerminal();
  document.querySelector<HTMLElement>(`[data-pane="${pane}"]`)?.focus();
}

/** App-wide keys, run before anything else sees the event. Returns whether the key was handled. */
export function handleKey(e: KeyboardEvent): boolean {
  const terminal = useTerminalStore.getState();

  if (hasMod(e) && e.shiftKey && e.code === "KeyM") {
    terminal.toggleMaximized();
    return true;
  }
  if (hasMod(e) && !e.shiftKey && !e.altKey && e.code in FOCUS_KEY) {
    if (!terminal.maximized) focusPane(FOCUS_KEY[e.code]);
    return true;
  }

  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return false;
  const selection = useSelectionStore.getState();
  const reviewable = isWorkingCopy(useGraphStore.getState(), selection.selection?.change);
  switch (e.key) {
    case "n":
      selection.moveChange(1);
      break;
    case "p":
      selection.moveChange(-1);
      break;
    case "@":
      selection.selectWorkingCopy();
      break;
    case "j":
      selection.moveFile(1);
      break;
    case "k":
      selection.moveFile(-1);
      break;
    case "]":
      selection.moveHunk(1, false);
      break;
    case "[":
      selection.moveHunk(-1, false);
      break;
    case "u":
      if (reviewable) {
        selection.moveHunk(1, true);
      }
      break;
    case " ":
      if (reviewable) {
        void selection.toggleHunk(true);
      }
      break;
    case "R":
      if (!reviewable) {
        return false;
      }

      void selection.toggleFile();
      break;
    case "c":
      selection.toggleCollapse();
      break;
    default:
      return false;
  }
  return true;
}
