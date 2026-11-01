import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { observeSize, TERMINAL_FONT } from "@/terminal/engine";
import type { TerminalEngine, TerminalSize } from "@/terminal/engine";

export class XtermEngine implements TerminalEngine {
  private term: Terminal | null = null;
  private stopObserving: (() => void) | null = null;

  async mount(host: HTMLElement) {
    const fit = new FitAddon();
    const term = new Terminal({ ...TERMINAL_FONT, scrollback: 10_000, cursorBlink: true });
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    this.stopObserving = observeSize(host, () => fit.fit());
    this.term = term;
  }

  write(data: Uint8Array) {
    this.term?.write(data);
  }

  size(): TerminalSize {
    return { cols: this.term?.cols ?? 80, rows: this.term?.rows ?? 24 };
  }

  onData(handler: (data: string) => void) {
    this.term?.onData(handler);
  }

  onResize(handler: (size: TerminalSize) => void) {
    this.term?.onResize(handler);
  }

  focus() {
    this.term?.focus();
  }

  dispose() {
    this.stopObserving?.();
    this.term?.dispose();
  }
}
