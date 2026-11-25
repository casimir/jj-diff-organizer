import { useEffect, useMemo, useRef } from "react";

import type { DragObject } from "@/core/dnd/objects";
import { groupFiles, type FileGroup } from "@/core/files";
import { diffStat, fileState, filesState } from "@/core/hunks";
import { useDragObject } from "@/hooks/useDragObject";
import { useDiffStore } from "@/store/diff";
import { useSelectedChange, useSelectionStore } from "@/store/selection";
import { FileStatus, type FileView } from "@/types";
import { ListRow } from "@/ui/components/ListRow";
import { DiffStat } from "@/ui/widgets/DiffStat";
import { ReviewDot } from "@/ui/widgets/ReviewDot";

const STATUS: Record<FileStatus, { letter: string; className: string }> = {
  [FileStatus.Added]: { letter: "A", className: "text-success" },
  [FileStatus.Modified]: { letter: "M", className: "text-accent" },
  [FileStatus.Deleted]: { letter: "D", className: "text-danger" },
  [FileStatus.Renamed]: { letter: "R", className: "text-special" },
};

const ROW = "flex items-center gap-2 py-1 pr-2";

function DirRow({ group, reviewable }: { group: FileGroup; reviewable: boolean }) {
  const state = useDiffStore((s) => filesState(group.files, s.marks));

  return (
    <ListRow className={`${ROW} pl-2 text-dim`}>
      <span className="min-w-0 flex-1 truncate">{group.dir}/</span>
      {reviewable && (
        <ReviewDot
          state={state}
          quiet
          onClick={() => void useSelectionStore.getState().toggleGroup(group.files.map((f) => f.path))}
        />
      )}
    </ListRow>
  );
}

function FileRow({ file, indented, reviewable }: { file: FileView; indented: boolean; reviewable: boolean }) {
  const state = useDiffStore((s) => fileState(file, s.marks));
  const selected = useSelectionStore((s) => s.selection?.file?.path === file.path);
  const stat = useMemo(() => diffStat([file]), [file]);
  const change = useSelectedChange();
  const ref = useRef<HTMLDivElement>(null);
  const object: DragObject | undefined = change && {
    kind: "file",
    from: change,
    path: file.path,
    renamedFrom: file.status === FileStatus.Renamed ? file.old_path : null,
  };
  const dragAttributes = useDragObject(`file:${file.path}`, ref, object, !change || change.immutable);
  const name = file.path.split("/").pop();
  const { letter, className } = STATUS[file.status];

  useEffect(() => {
    if (selected) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  return (
    <ListRow
      ref={ref}
      selected={selected}
      title={file.path}
      onClick={() => useSelectionStore.getState().clickFile(file.path)}
      {...dragAttributes}
      className={`${ROW} ${indented ? "pl-5" : "pl-2"}`}
    >
      <span className={`shrink-0 font-mono ${className}`}>{letter}</span>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {!file.binary && <DiffStat {...stat} />}
      {reviewable && (
        <ReviewDot state={state} quiet onClick={() => void useSelectionStore.getState().toggleFile(file.path)} />
      )}
    </ListRow>
  );
}

export function FileList({ files, reviewable }: { files: FileView[]; reviewable: boolean }) {
  const groups = useMemo(() => groupFiles(files), [files]);

  return groups.map((group) => (
    <section key={group.dir ?? ""}>
      {group.dir !== null && <DirRow group={group} reviewable={reviewable} />}
      {group.files.map((file) => (
        <FileRow key={file.path} file={file} indented={group.dir !== null} reviewable={reviewable} />
      ))}
    </section>
  ));
}
