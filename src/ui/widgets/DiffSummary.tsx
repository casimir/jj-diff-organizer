import { useMemo } from "react";

import { diffStat } from "@/core/hunks";
import type { FileView } from "@/types";
import { Header } from "@/ui/components/Header";
import { DiffStat } from "@/ui/widgets/DiffStat";

export function DiffSummary({ files }: { files: FileView[] }) {
  const stat = useMemo(() => diffStat(files), [files]);
  return (
    <Header className="border-strong text-dim">
      <span>
        {files.length} {files.length === 1 ? "file" : "files"}
      </span>
      <DiffStat {...stat} />
    </Header>
  );
}
