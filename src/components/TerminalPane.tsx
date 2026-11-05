import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";

import * as api from "@/api";
import { ErrorText } from "@/components/ui/ErrorText";
import { KeyBadge } from "@/components/ui/KeyBadge";
import { terminalEffect } from "@/graph/drop";
import { colorScheme, useColorScheme } from "@/hooks/useColorScheme";
import { dropAttributes, useDropTarget } from "@/hooks/useDropTarget";
import { MOD } from "@/keys";
import { useUiStore } from "@/store/ui";
import { TERMINAL_THEMES } from "@/terminal/themes";

const TERMINAL_ID = "terminal";
const EXIT_NOTICE = new TextEncoder().encode("\r\n[shell exited, press Enter to restart]");

export function TerminalPane() {
  const host = useRef<HTMLDivElement>(null);
  const pane = useRef<HTMLDivElement>(null);
  const { state, destructive } = useDropTarget(TERMINAL_ID, pane, terminalEffect);
  const termRef = useRef<Terminal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const maximized = useUiStore((s) => s.shellMaximized);
  const theme = TERMINAL_THEMES[useColorScheme()];

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = theme;
  }, [theme]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false;
    let exited = false;
    const fail = (e: unknown) => {
      if (!cancelled) setError(api.errorMessage(e));
    };
    setError(null);

    const term = new Terminal({
      fontFamily: "monospace",
      fontSize: 13,
      scrollback: 10_000,
      cursorBlink: true,
      theme: TERMINAL_THEMES[colorScheme()],
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    fit.fit();
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(element);
    termRef.current = term;

    term.onData((data) => {
      if (!exited) api.ptyWrite(data).catch(fail);
      else if (data === "\r") setSession((n) => n + 1);
    });
    term.onResize(({ cols, rows }) => {
      if (!exited) api.ptyResize(cols, rows).catch(fail);
    });

    api
      .ptyStart(
        term.cols,
        term.rows,
        (bytes) => term.write(bytes),
        () => {
          exited = true;
          term.write(EXIT_NOTICE);
        },
      )
      .then(() => {
        if (cancelled) return;
        term.focus();
        useUiStore.getState().setFocusTerminal(() => term.focus());
        useUiStore.getState().setInsertIntoTerminal((text) => {
          if (!exited) api.ptyWrite(text).catch(fail);
          term.focus();
        });
      })
      .catch(fail);

    return () => {
      cancelled = true;
      useUiStore.getState().setFocusTerminal(() => {});
      useUiStore.getState().setInsertIntoTerminal(() => {});
      observer.disconnect();
      termRef.current = null;
      term.dispose();
    };
  }, [session]);

  return (
    <div
      ref={pane}
      data-terminal
      {...dropAttributes(state, destructive)}
      style={{ background: theme.background }}
      className={`flex flex-col p-1 ${maximized ? "fixed inset-0 z-(--z-overlay)" : "relative h-full"}`}
    >
      {error && (
        <ErrorText className="absolute inset-x-0 top-0 z-(--z-sticky)">{error}</ErrorText>
      )}
      <div key={session} ref={host} className="min-h-0 w-full flex-1" />
      <div className="flex shrink-0 gap-3 pt-1 text-muted">
        <span>
          <KeyBadge>{`${MOD}+2`}</KeyBadge> focus
        </span>
        <span>
          <KeyBadge>{`${MOD}+Shift+M`}</KeyBadge> {maximized ? "restore" : "maximize"}
        </span>
      </div>
    </div>
  );
}
