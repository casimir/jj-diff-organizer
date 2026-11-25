import type { Stat } from "@/core/hunks";

export function DiffStat({ added, removed }: Stat) {
  return (
    <span className="flex gap-1 font-mono">
      {added > 0 && <span className="text-success">+{added}</span>}
      {removed > 0 && <span className="text-danger">-{removed}</span>}
    </span>
  );
}
