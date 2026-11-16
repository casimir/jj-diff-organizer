import { IS_MAC } from "@/platform";
import { selectIsWorkingCopy, useGraphStore } from "@/store/graph";
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
  const graph = useGraphStore.getState();
  const reviewable = selectIsWorkingCopy(graph);
  if (e.key === "n") graph.moveChange(1);
  else if (e.key === "p") graph.moveChange(-1);
  else if (e.key === "@") {
    const wc = graph.changes.find((c) => c.wc);
    if (wc) void graph.select(wc.change_id);
  } else if (e.key === "j") graph.moveFile(1);
  else if (e.key === "k") graph.moveFile(-1);
  else if (e.key === "]") graph.moveCursor(1, false);
  else if (e.key === "[") graph.moveCursor(-1, false);
  else if (reviewable && e.key === "u") graph.moveCursor(1, true);
  else if (e.key === " ") {
    if (reviewable) void graph.toggleHunk();
  }
  else if (reviewable && e.key === "R") void graph.toggleFile();
  else return false;
  return true;
}
