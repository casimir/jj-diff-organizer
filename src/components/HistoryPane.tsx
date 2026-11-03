import { useState } from "react";
import TimeAgo from "react-timeago";

import * as api from "@/api";
import { MOD } from "@/keys";
import { KeyBadge } from "@/components/ui/KeyBadge";
import { StatusBar } from "@/components/ui/StatusBar";
import { TextInput } from "@/components/ui/TextInput";
import { useHistoryStore } from "@/store/history";

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
          {entries.map(({ id, time, command, gui, failed, detail }) => {
            const selected = id === selectedKey;
            return (
              <div key={id} className="border-b border-line">
                <div
                  className={`flex cursor-default gap-2 px-2 py-1 ${selected ? "bg-selected" : "hover:bg-subtle"}`}
                  onClick={() => useHistoryStore.getState().select(selected ? null : id)}
                >
                  <span className={gui ? "text-accent" : "text-muted"}>
                    {gui ? "gui" : "op"}
                  </span>
                  <span className={`min-w-0 flex-1 truncate font-mono ${failed ? "text-danger" : ""}`}>
                    {command}
                  </span>
                  {failed && <span className="text-danger">failed</span>}
                  <span className="text-muted">
                    <TimeAgo date={time} title={new Date(time).toLocaleString()} />
                  </span>
                </div>
                {selected && (
                  <pre className="px-2 pb-2 font-mono whitespace-pre-wrap text-dim">{detail}</pre>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <StatusBar>
        <KeyBadge>{`${MOD}+3`}</KeyBadge> focus
      </StatusBar>
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
      <TextInput
        className="w-full"
        placeholder="dev: run jj with args"
        value={line}
        onChange={(e) => setLine(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void run();
        }}
      />
      {error && <div className="text-danger">{error}</div>}
    </div>
  );
}
