import { selectIsWorkingCopy, useGraphStore } from "@/store/graph";
import { useUiStore } from "@/store/ui";

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
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
  const ui = useUiStore.getState();
  if (pane === "terminal") return ui.focusTerminal();
  if (pane === "history") ui.showHistory();
  document.querySelector<HTMLElement>(`[data-pane="${pane}"]`)?.focus();
}

/** App-wide keys, run before anything else sees the event. Returns whether the key was handled. */
export function handleKey(e: KeyboardEvent): boolean {
  const ui = useUiStore.getState();

  if (hasMod(e) && e.shiftKey && e.code === "KeyM") {
    ui.toggleShellMaximized();
    return true;
  }
  if (hasMod(e) && !e.shiftKey && !e.altKey && e.code in FOCUS_KEY) {
    if (!ui.shellMaximized) focusPane(FOCUS_KEY[e.code]);
    return true;
  }

  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || ui.settingsOpen) return false;
  const graph = useGraphStore.getState();
  const reviewable = selectIsWorkingCopy(graph);
  if (e.key === "n") graph.moveChange(1);
  else if (e.key === "p") graph.moveChange(-1);
  else if (e.key === "j") graph.moveFile(1);
  else if (e.key === "k") graph.moveFile(-1);
  else if (e.key === "]") graph.moveCursor(1, false);
  else if (e.key === "[") graph.moveCursor(-1, false);
  else if (e.key === "a") graph.selectAllFiles();
  else if (reviewable && e.key === "u") graph.moveCursor(1, true);
  else if (reviewable && e.key === "r") void graph.toggleHunk();
  else if (reviewable && e.key === "R") void graph.toggleFile();
  else return false;
  return true;
}
