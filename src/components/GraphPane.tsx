import { useMemo, useState } from "react";

import { GraphRow } from "@/components/GraphRow";
import { Button, ButtonVariant } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { KeyBadge } from "@/components/ui/KeyBadge";
import { StatusBar } from "@/components/ui/StatusBar";
import { TextInput } from "@/components/ui/TextInput";
import { changeEffect, DropState } from "@/graph/drop";
import { layoutGraph } from "@/graph/layout";
import { dropAttributes, useDropCandidate } from "@/hooks/useDropTarget";
import { MOD } from "@/keys";
import { useGraphStore } from "@/store/graph";
import { useUiStore } from "@/store/ui";

const selectChange = (changeId: string) => void useGraphStore.getState().select(changeId);

export function GraphPane() {
  const revset = useGraphStore((s) => s.revset);
  const changes = useGraphStore((s) => s.changes);
  const error = useGraphStore((s) => s.error);
  const selectedId = useGraphStore((s) => s.selectedId);
  const layout = useMemo(() => layoutGraph(changes), [changes]);
  const effects = useMemo(() => layout.rows.map((row) => changeEffect(row.change)), [layout]);
  const { candidate, destructive } = useDropCandidate(effects);

  return (
    <div data-pane="graph" tabIndex={-1} className="flex h-full flex-col outline-none">
      <div className="flex gap-2 border-b border-line p-1">
        <RevsetInput key={revset} initial={revset} />
        <Button
          variant={ButtonVariant.Ghost}
          title="Settings"
          onClick={() => useUiStore.getState().setSettingsOpen(true)}
        >
          ⚙
        </Button>
      </div>
      {error && <ErrorText className="border-b border-danger">{error}</ErrorText>}
      <div
        {...dropAttributes(candidate ? DropState.Candidate : undefined, destructive)}
        className="min-h-0 flex-1 overflow-auto"
      >
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
      <StatusBar>
        <KeyBadge>n</KeyBadge> <KeyBadge>p</KeyBadge> next / previous change <KeyBadge>@</KeyBadge> working copy{" "}
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
