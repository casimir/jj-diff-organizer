import { useEffect, useRef, useState } from "react";

import * as api from "@/api";
import { MOD } from "@/keys";
import { KeyBadge } from "@/components/KeyBadge";
import { createEngine } from "@/terminal/engine";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";

const EXIT_NOTICE = new TextEncoder().encode("\r\n[shell exited, press Enter to restart]");

export function TerminalPane() {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState(0);
  const maximized = useUiStore((s) => s.shellMaximized);
  const engine = useSettingsStore((s) => s.engine);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false;
    let dispose = () => {};
    let exited = false;
    const fail = (e: unknown) => {
      if (!cancelled) setError(`${engine}: ${api.errorMessage(e)}`);
    };
    setError(null);

    void (async () => {
      try {
        const term = await createEngine(engine);
        dispose = () => term.dispose();
        await term.mount(element);
        if (cancelled) return term.dispose();
        term.onData((data) => {
          if (!exited) api.ptyWrite(data).catch(fail);
          else if (data === "\r") setSession((n) => n + 1);
        });
        term.onResize(({ cols, rows }) => {
          if (!exited) api.ptyResize(cols, rows).catch(fail);
        });
        const { cols, rows } = term.size();
        await api.ptyStart(
          cols,
          rows,
          (bytes) => term.write(bytes),
          () => {
            exited = true;
            term.write(EXIT_NOTICE);
          },
        );
        term.focus();
        useUiStore.getState().setFocusTerminal(() => term.focus());
      } catch (e) {
        fail(e);
      }
    })();

    return () => {
      cancelled = true;
      useUiStore.getState().setFocusTerminal(() => {});
      dispose();
    };
  }, [engine, session]);

  return (
    <div data-terminal className={`flex flex-col bg-black p-1 ${maximized ? "fixed inset-0 z-50" : "relative h-full"}`}>
      {error && (
        <pre className="absolute inset-x-0 top-0 z-10 bg-red-950 p-2 whitespace-pre-wrap text-red-300">
          {error}
        </pre>
      )}
      <div key={`${engine}-${session}`} ref={host} className="min-h-0 w-full flex-1" />
      <div className="flex shrink-0 gap-3 pt-1 text-zinc-500">
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
