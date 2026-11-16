import { memo, useEffect, useRef } from "react";

import type { Handler } from "@/core/dnd/model";
import type { DragObject } from "@/core/dnd/objects";
import { GRAPH_GROUP } from "@/core/dnd/targets/row";
import type { Row } from "@/core/layout";
import { useDragObject } from "@/hooks/useDragObject";
import { useDropTarget } from "@/hooks/useDropTarget";
import { ChipTone } from "@/ui/components/Chip";
import { ListRow } from "@/ui/components/ListRow";
import { DragLabel } from "@/ui/widgets/DragLabel";

const ROW_HEIGHT = 28;
const LANE_WIDTH = 14;
const MID = ROW_HEIGHT / 2;
const STUB = 6;

const laneX = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2;

export const GraphRow = memo(function GraphRow({
  row,
  handler,
  laneCount,
  selected,
  onSelect,
}: {
  row: Row;
  handler: Handler;
  laneCount: number;
  selected: boolean;
  onSelect: (changeId: string) => void;
}) {
  const { change, col, before, parentLanes, elided } = row;
  const x = laneX(col);
  const fill = change.wc ? "fill-success" : change.immutable ? "fill-muted" : "fill-canvas";

  const ref = useRef<HTMLDivElement>(null);
  const object: DragObject = { kind: "change", change };
  const dragAttributes = useDragObject(`change:${change.commit_id}`, ref, object, change.immutable);
  const dropTarget = useDropTarget(`row:${change.commit_id}`, ref, { handler, group: GRAPH_GROUP });
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <ListRow
      ref={ref}
      selected={selected}
      onClick={() => onSelect(change.change_id)}
      {...dragAttributes}
      {...dropTarget}
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
          object={{ kind: "wc", change }}
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
          object={{ kind: "bookmark", name: b }}
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
