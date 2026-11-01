import { useMemo, useState } from "react";

import { GraphRow } from "@/components/GraphRow";
import { MOD } from "@/keys";
import { KeyBadge } from "@/components/KeyBadge";
import { layoutGraph } from "@/graph/layout";
import { useGraphStore } from "@/store/graph";
import { useUiStore } from "@/store/ui";

const selectChange = (changeId: string) => void useGraphStore.getState().select(changeId);

export function GraphPane() {
  const revset = useGraphStore((s) => s.revset);
  const changes = useGraphStore((s) => s.changes);
  const error = useGraphStore((s) => s.error);
  const selectedId = useGraphStore((s) => s.selectedId);
  const layout = useMemo(() => layoutGraph(changes), [changes]);

  return (
    <div data-pane="graph" tabIndex={-1} className="flex h-full flex-col outline-none">
      <div className="flex gap-2 border-b border-zinc-800 p-1">
        <RevsetInput key={revset} initial={revset} />
        <button
          className="rounded px-2 hover:bg-zinc-700"
          title="Settings"
          onClick={() => useUiStore.getState().setSettingsOpen(true)}
        >
          ⚙
        </button>
      </div>
      {error && <pre className="border-b border-red-900 p-2 whitespace-pre-wrap text-red-400">{error}</pre>}
      <div className="min-h-0 flex-1 overflow-auto">
        {layout.rows.map((row) => (
          <GraphRow
            key={row.change.commit_id}
            row={row}
            laneCount={layout.laneCount}
            selected={row.change.change_id === selectedId}
            onSelect={selectChange}
          />
        ))}
      </div>
      <footer className="shrink-0 border-t border-zinc-800 px-2 py-0.5 text-zinc-500">
        <KeyBadge>n</KeyBadge> <KeyBadge>p</KeyBadge> next / previous change{" "}
        <KeyBadge>{`${MOD}+1`}</KeyBadge> focus
      </footer>
    </div>
  );
}

function RevsetInput({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <input
      className="min-w-0 flex-1 rounded bg-zinc-800 px-2 py-1 font-mono outline-none focus:ring-1 focus:ring-zinc-500"
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") void useGraphStore.getState().setRevset(value);
      }}
    />
  );
}
