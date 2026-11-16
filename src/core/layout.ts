import type { Change } from "@/types";

export interface Row {
  change: Change;
  col: number;
  before: (string | null)[];
  parentLanes: number[];
  elided: boolean;
}

export interface Layout {
  rows: Row[];
  laneCount: number;
}

/** `changes` come children first, as `jj log` prints them. */
export function layoutGraph(changes: Change[]): Layout {
  const known = new Set(changes.map((c) => c.commit_id));
  const lanes: (string | null)[] = [];
  const rows: Row[] = [];
  let laneCount = 1;

  const freeLane = (prefer?: number): number => {
    if (prefer !== undefined && lanes[prefer] == null) return prefer;
    const free = lanes.indexOf(null);
    return free === -1 ? lanes.length : free;
  };

  for (const change of changes) {
    const before = lanes.slice();
    let col = lanes.indexOf(change.commit_id);
    if (col === -1) col = freeLane();

    lanes.forEach((id, i) => {
      if (id === change.commit_id) lanes[i] = null;
    });
    lanes[col] = null;

    const visibleParents = change.parents.filter((p) => known.has(p));
    const parentLanes = visibleParents.map((parent, i) => {
      let lane = lanes.indexOf(parent);
      if (lane === -1) {
        lane = freeLane(i === 0 ? col : undefined);
        lanes[lane] = parent;
      }
      return lane;
    });

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    laneCount = Math.max(laneCount, before.length, lanes.length, col + 1);
    rows.push({
      change,
      col,
      before,
      parentLanes,
      elided: visibleParents.length < change.parents.length,
    });
  }
  return { rows, laneCount };
}
