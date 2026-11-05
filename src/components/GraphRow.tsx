import { memo, useEffect, useMemo, useRef } from "react";

import { DragLabel } from "@/components/DragLabel";
import { ChipTone } from "@/components/ui/Chip";
import { ListRow } from "@/components/ui/ListRow";
import { changeEffect, Zone, type DragSource } from "@/graph/drop";
import type { Row } from "@/graph/layout";
import { useDragSource } from "@/hooks/useDragSource";
import { dropAttributes, useDropTarget } from "@/hooks/useDropTarget";
import { useDragStore } from "@/store/drag";

const ROW_HEIGHT = 28;
const LANE_WIDTH = 14;
const MID = ROW_HEIGHT / 2;
const STUB = 6;

const laneX = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2;

export const GraphRow = memo(function GraphRow({
  row,
  laneCount,
  selected,
  onSelect,
}: {
  row: Row;
  laneCount: number;
  selected: boolean;
  onSelect: (changeId: string) => void;
}) {
  const { change, col, before, parentLanes, elided } = row;
  const x = laneX(col);
  const fill = change.wc ? "fill-success" : change.immutable ? "fill-muted" : "fill-canvas";

  const ref = useRef<HTMLDivElement>(null);
  const source: DragSource = { kind: "change", change };
  const dragAttributes = useDragSource(`change:${change.commit_id}`, ref, source, change.immutable);
  const rowId = `row:${change.commit_id}`;
  const effect = useMemo(() => changeEffect(change), [change]);
  const { active, state, destructive } = useDropTarget(rowId, ref, effect);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const edge = useDragStore((s) => (active && s.source?.kind === "change" && s.zone !== Zone.Onto ? s.zone : null));

  return (
    <ListRow
      ref={ref}
      selected={selected}
      onClick={() => onSelect(change.change_id)}
      {...dragAttributes}
      {...dropAttributes(edge ?? state, destructive)}
      className="flex items-center pl-2"
      style={{ height: ROW_HEIGHT }}
    >
      <svg width={laneCount * LANE_WIDTH} height={ROW_HEIGHT} className="shrink-0 stroke-muted">
        {before.map((id, lane) => {
          if (id === null) return null;
          const merges = id === change.commit_id;
          return (
            <line
              key={lane}
              x1={laneX(lane)}
              y1={0}
              x2={merges ? x : laneX(lane)}
              y2={merges ? MID : ROW_HEIGHT}
            />
          );
        })}
        {parentLanes.map((lane, i) => (
          <line key={i} x1={x} y1={MID} x2={laneX(lane)} y2={ROW_HEIGHT} />
        ))}
        {elided && <line x1={x} y1={MID} x2={x} y2={MID + STUB} strokeDasharray="2 2" />}
        <circle
          cx={x}
          cy={MID}
          r={change.wc ? 5 : 4}
          className={`${fill} ${change.conflict ? "stroke-danger" : "stroke-dim"}`}
          strokeWidth={1.5}
        />
      </svg>
      <span className="mr-2 shrink-0 font-mono text-change-id">
        <b className="text-fg">{change.short_prefix}</b>
        {change.short.slice(change.short_prefix.length)}
      </span>
      {change.wc && (
        <DragLabel
          id="wc"
          source={{ kind: "wc", change }}
          tone={ChipTone.Success}
          className="mr-1 shrink-0"
        >
          @
        </DragLabel>
      )}
      {change.bookmarks.map((b) => (
        <DragLabel
          key={b}
          id={`bookmark:${b}`}
          source={{ kind: "bookmark", name: b }}
          tone={ChipTone.Accent}
          className="mr-1 shrink-0"
        >
          {b}
          {change.unsynced_bookmarks.includes(b) && "*"}
        </DragLabel>
      ))}
      <span className={`truncate ${change.desc ? "" : "text-muted italic"}`}>
        {change.desc || (change.empty ? "(empty) (no description)" : "(no description)")}
      </span>
    </ListRow>
  );
});
