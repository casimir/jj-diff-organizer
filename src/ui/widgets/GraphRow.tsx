import { memo, useEffect, useRef } from "react";

import type { Handler } from "@/core/dnd/model";
import type { DragObject } from "@/core/dnd/objects";
import { GRAPH_GROUP } from "@/core/dnd/targets/row";
import type { Row } from "@/core/layout";
import { useDragObject } from "@/hooks/useDragObject";
import { useDropTarget } from "@/hooks/useDropTarget";
import { ChipTone } from "@/ui/components/Chip";
import { ListRow } from "@/ui/components/ListRow";
import { RelativeTime } from "@/ui/components/RelativeTime";
import { DragLabel } from "@/ui/widgets/DragLabel";

const LINES = 2;
const NODE_Y = `${50 / LINES}%`;
const LINE_END_Y = `${100 / LINES}%`;

const diamond = (r: number) => `0,${-r} ${r},0 0,${r} ${-r},0`;

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
  const laneX = (lane: number) => `${((lane + 0.5) / laneCount) * 100}%`;
  const x = laneX(col);
  const fill = change.wc ? "fill-success" : change.immutable ? "fill-muted" : "fill-canvas";
  const nodeClass = `${fill} ${change.conflict ? "stroke-danger" : "stroke-dim"}`;
  const radius = change.wc ? 5 : 4;
  const [shortId, offset] = change.short.split("/");

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
      className="flex gap-2 pl-2"
    >
      <div className="relative shrink-0" style={{ width: `calc(var(--spacing-lane) * ${laneCount})` }}>
        <svg className="absolute inset-0 size-full stroke-muted">
          {before.map((id, lane) => {
            if (id === null) return null;
            const merges = id === change.commit_id;
            return (
              <line
                key={lane}
                x1={laneX(lane)}
                y1="0%"
                x2={merges ? x : laneX(lane)}
                y2={merges ? NODE_Y : "100%"}
              />
            );
          })}
          {parentLanes.map((lane, i) => (
            <line key={i} x1={x} y1={NODE_Y} x2={laneX(lane)} y2="100%" />
          ))}
          {elided && <line x1={x} y1={NODE_Y} x2={x} y2={LINE_END_Y} strokeDasharray="2 2" />}
          <svg x={x} y={NODE_Y} overflow="visible">
            {change.immutable ? (
              <polygon points={diamond(radius)} className={nodeClass} strokeWidth={1.5} />
            ) : (
              <circle r={radius} className={nodeClass} strokeWidth={1.5} />
            )}
          </svg>
        </svg>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 py-0.5 pr-2">
          <span className="shrink-0 font-mono text-change-id">
            <b className="text-fg">{change.short_prefix}</b>
            {shortId.slice(change.short_prefix.length)}
            {offset !== undefined && <span className="text-danger">/{offset}</span>}
          </span>
          <div className="flex min-w-0 flex-1 gap-1">
            {change.wc && (
              <DragLabel
                id="wc"
                object={{ kind: "wc", change }}
                tone={ChipTone.Success}
                className="shrink-0"
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
                className="min-w-0 truncate"
              >
                {b}
                {change.unsynced_bookmarks.includes(b) && "*"}
              </DragLabel>
            ))}
          </div>
          <RelativeTime ms={change.committed_ms} className="shrink-0 text-muted" />
        </div>
        <span className={`truncate py-0.5 pr-2 ${change.desc ? "" : "text-muted italic"}`}>
          {change.desc || (change.empty ? "(empty) (no description)" : "(no description)")}
        </span>
      </div>
    </ListRow>
  );
});
