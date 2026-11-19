import type { Stat } from "@/core/hunks";

export function DiffStat({ added, removed }: Stat) {
  return (
    <span className="font-mono">
      <span className="text-success">+{added}</span> <span className="text-danger">-{removed}</span>
    </span>
  );
}
