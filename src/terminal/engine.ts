import { EngineName } from "@/types";

export interface TerminalSize {
  cols: number;
  rows: number;
}

export const TERMINAL_FONT = { fontFamily: "monospace", fontSize: 13 } as const;

export interface TerminalEngine {
  mount: (host: HTMLElement) => Promise<void>;
  write: (data: Uint8Array) => void;
  size: () => TerminalSize;
  onData: (handler: (data: string) => void) => void;
  onResize: (handler: (size: TerminalSize) => void) => void;
  focus: () => void;
  dispose: () => void;
}

export async function createEngine(name: EngineName): Promise<TerminalEngine> {
  if (name === EngineName.Ghostty) {
    const { GhosttyEngine } = await import("@/terminal/ghostty");
    return new GhosttyEngine();
  }
  const { XtermEngine } = await import("@/terminal/xterm");
  return new XtermEngine();
}

export function observeSize(host: HTMLElement, fit: () => void): () => void {
  const observer = new ResizeObserver(fit);
  observer.observe(host);
  return () => observer.disconnect();
}
