import { FitAddon, init, Terminal } from "ghostty-web";

import { observeSize, TERMINAL_FONT } from "@/terminal/engine";
import type { TerminalEngine, TerminalSize } from "@/terminal/engine";

const PRIMARY_DA_QUERY = /\x1b\[0?c/;
const PRIMARY_DA_REPLY = "\x1b[?1;2c";
const latin1 = new TextDecoder("latin1");

export class GhosttyEngine implements TerminalEngine {
  private term: Terminal | null = null;
  private dataHandler: ((data: string) => void) | null = null;
  private stopObserving: (() => void) | null = null;

  async mount(host: HTMLElement) {
    await init();
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
    if (PRIMARY_DA_QUERY.test(latin1.decode(data))) this.dataHandler?.(PRIMARY_DA_REPLY);
  }

  size(): TerminalSize {
    return { cols: this.term?.cols ?? 80, rows: this.term?.rows ?? 24 };
  }

  onData(handler: (data: string) => void) {
    this.dataHandler = handler;
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
