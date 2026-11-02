import { useState } from "react";
import TimeAgo from "react-timeago";

import * as api from "@/api";
import { MOD } from "@/keys";
import { KeyBadge } from "@/components/KeyBadge";
import { entryKey, useHistoryStore } from "@/store/history";
import type { Entry } from "@/types";

function describe(entry: Entry) {
  if (entry.source === "gui") {
    const { run } = entry;
    return {
      gui: true,
      command: run.command,
      failed: run.exit_code !== 0,
      meta: `${run.duration_ms} ms`,
      output: [run.stdout, run.stderr].filter(Boolean).join("\n"),
    };
  }
  const { op } = entry;
  return {
    gui: entry.gui,
    command: op.attributes.args || op.description,
    failed: false,
    meta: <TimeAgo date={op.time.start} title={new Date(op.time.start).toLocaleString()} />,
    output: op.description,
  };
}

export function HistoryPane() {
  const entries = useHistoryStore((s) => s.entries);
  const error = useHistoryStore((s) => s.error);
  const selectedKey = useHistoryStore((s) => s.selectedKey);

  return (
    <div data-pane="history" tabIndex={-1} className="flex h-full flex-col outline-none">
      {import.meta.env.DEV && <DevRunner />}
      {error && <pre className="p-2 whitespace-pre-wrap text-danger">{error}</pre>}
      <div className="flex min-h-0 flex-1 flex-col-reverse overflow-auto">
        <div>
          {entries.map((entry) => {
            const key = entryKey(entry);
            const { gui, command, failed, meta, output } = describe(entry);
            const selected = key === selectedKey;
            return (
              <div key={key} className="border-b border-line">
                <div
                  className={`flex cursor-default gap-2 px-2 py-1 ${selected ? "bg-selected" : "hover:bg-subtle"}`}
                  onClick={() => useHistoryStore.getState().select(selected ? null : key)}
                >
                  <span className={gui ? "text-accent" : "text-zinc-500"}>
                    {gui ? "gui" : "op"}
                  </span>
                  <span className={`min-w-0 flex-1 truncate font-mono ${failed ? "text-danger" : ""}`}>
                    {command}
                  </span>
                  {failed && <span className="text-danger">failed</span>}
                  <span className="text-zinc-500">{meta}</span>
                </div>
                {selected && (
                  <pre className="px-2 pb-2 font-mono whitespace-pre-wrap text-dim">{output}</pre>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <footer className="shrink-0 border-t border-line px-2 py-0.5 text-zinc-500">
        <KeyBadge>{`${MOD}+3`}</KeyBadge> focus
      </footer>
    </div>
  );
}

function splitArgs(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "");
}

function DevRunner() {
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    try {
      await api.runJj(splitArgs(line));
      setError(null);
      setLine("");
    } catch (e) {
      setError(api.errorMessage(e));
    }
  };

  return (
    <div className="border-b border-line p-1">
      <input
        className="w-full rounded bg-subtle px-2 py-1 font-mono outline-none focus:ring-1 focus:ring-zinc-500"
        placeholder="dev: run jj with args"
        value={line}
        spellCheck={false}
        onChange={(e) => setLine(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void run();
        }}
      />
      {error && <div className="text-danger">{error}</div>}
    </div>
  );
}
