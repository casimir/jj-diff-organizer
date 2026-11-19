import { useMemo, useState } from "react";

import { GRAPH_GROUP, rowHandler } from "@/core/dnd/targets/row";
import { layoutGraph } from "@/core/layout";
import { useDropGroup } from "@/hooks/useDropTarget";
import { MOD } from "@/keys";
import { useGraphStore } from "@/store/graph";
import { useSelectionStore } from "@/store/selection";
import { ErrorText } from "@/ui/components/ErrorText";
import { KeyBadge } from "@/ui/components/KeyBadge";
import { StatusBar } from "@/ui/components/StatusBar";
import { TextInput } from "@/ui/components/TextInput";
import { GraphRow } from "@/ui/widgets/GraphRow";

const selectChange = (changeId: string) => useSelectionStore.getState().selectChange(changeId);

export function GraphPane() {
  const revset = useGraphStore((s) => s.revset);
  const changes = useGraphStore((s) => s.changes);
  const error = useGraphStore((s) => s.error);
  const selectedId = useSelectionStore((s) => s.selection?.change);
  const layout = useMemo(() => layoutGraph(changes), [changes]);
  const targets = useMemo(() => layout.rows.map((row) => ({ row, handler: rowHandler(row.change) })), [layout]);
  const handlers = useMemo(() => targets.map((target) => target.handler), [targets]);
  const group = useDropGroup(GRAPH_GROUP, handlers);

  return (
    <div data-pane="graph" tabIndex={-1} className="flex h-full flex-col outline-none">
      <div className="flex gap-2 border-b border-line p-1">
        <RevsetInput key={revset} initial={revset} />
      </div>
      {error && <ErrorText className="border-b border-danger">{error}</ErrorText>}
      <div
        {...group}
        className="min-h-0 flex-1 overflow-auto"
      >
        {targets.map(({ row, handler }) => (
          <GraphRow
            key={row.change.commit_id}
            row={row}
            handler={handler}
            laneCount={layout.laneCount}
            selected={row.change.change_id === selectedId}
            onSelect={selectChange}
          />
        ))}
      </div>
      <StatusBar>
        <KeyBadge>n</KeyBadge> <KeyBadge>p</KeyBadge> navigate changes <KeyBadge>@</KeyBadge> working copy{" "}
        <KeyBadge>{`${MOD}+1`}</KeyBadge> focus
      </StatusBar>
    </div>
  );
}

function RevsetInput({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <TextInput
      className="min-w-0 flex-1"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") void useGraphStore.getState().setRevset(value);
      }}
    />
  );
}
