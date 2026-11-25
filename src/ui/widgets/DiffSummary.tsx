import { useMemo } from "react";

import { diffStat, reviewProgress } from "@/core/hunks";
import { useDiffStore } from "@/store/diff";
import type { FileView } from "@/types";
import { Header } from "@/ui/components/Header";
import { DiffStat } from "@/ui/widgets/DiffStat";

export function DiffSummary({ files, reviewable }: { files: FileView[]; reviewable: boolean }) {
  const stat = useMemo(() => diffStat(files), [files]);
  const reviewed = useDiffStore((s) => (reviewable ? reviewProgress(files, s.marks) : null));

  return (
    <Header className="border-strong text-dim">
      <span>
        {reviewed === null
          ? `${files.length} ${files.length === 1 ? "file" : "files"}`
          : `${reviewed}/${files.length} reviewed`}
      </span>
      <DiffStat {...stat} />
    </Header>
  );
}
