import { useRef } from "react";
import { Group, Panel } from "react-resizable-panels";

import { DiffView } from "@/components/DiffView";
import { Handle } from "@/components/Handle";
import { ReviewDot } from "@/components/ReviewDot";
import { TrashZone } from "@/components/TrashZone";
import { ErrorText } from "@/components/ui/ErrorText";
import { KeyBadge } from "@/components/ui/KeyBadge";
import { ListRow } from "@/components/ui/ListRow";
import { StatusBar } from "@/components/ui/StatusBar";
import type { DragSource } from "@/graph/drop";
import { useDragSource } from "@/hooks/useDragSource";
import { fileState } from "@/review/hunks";
import { selectIsWorkingCopy, selectSelectedChange, useGraphStore } from "@/store/graph";
import { FileStatus, type FileView } from "@/types";

const STATUS: Record<FileStatus, { letter: string; className: string }> = {
  [FileStatus.Added]: { letter: "A", className: "text-success" },
  [FileStatus.Modified]: { letter: "M", className: "text-accent" },
  [FileStatus.Deleted]: { letter: "D", className: "text-danger" },
  [FileStatus.Renamed]: { letter: "R", className: "text-special" },
};

function FileRow({ file, selected, reviewable }: {
  file: FileView;
  selected: boolean;
  reviewable: boolean;
}) {
  const state = useGraphStore((s) => fileState(file, s.marks));
  const change = useGraphStore(selectSelectedChange);
  const ref = useRef<HTMLDivElement>(null);
  const source: DragSource | undefined = change && {
    kind: "file",
    from: change,
    path: file.path,
    renamedFrom: file.status === FileStatus.Renamed ? file.old_path : null,
  };
  const dragAttributes = useDragSource(`file:${file.path}`, ref, source, !change || change.immutable);
  const name = file.path.split("/").pop();
  const { letter, className } = STATUS[file.status];
  return (
    <ListRow
      ref={ref}
      selected={selected}
      onClick={() => useGraphStore.getState().selectFile(file.path)}
      {...dragAttributes}
      className="flex items-center gap-2 px-2 py-1"
    >
      {reviewable &&
        (state ? (
          <ReviewDot state={state} onClick={() => void useGraphStore.getState().toggleFile(file.path)} />
        ) : (
          <span className="size-3 shrink-0" />
        ))}
      <span className={`shrink-0 font-mono ${className}`}>{letter}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate">{name}</div>
        <div className="truncate text-xs text-muted">{file.path}</div>
      </div>
    </ListRow>
  );
}

export function DetailsPane() {
  const selectedId = useGraphStore((s) => s.selectedId);

  return (
    <div className="relative h-full">
      {selectedId ? <Details /> : <div className="p-2 text-muted">Select a change in the graph.</div>}
      <TrashZone />
    </div>
  );
}

function Details() {
  const selectedId = useGraphStore((s) => s.selectedId);
  const files = useGraphStore((s) => s.files);
  const selectedPath = useGraphStore((s) => s.selectedPath);
  const detailsError = useGraphStore((s) => s.detailsError);
  const reviewable = useGraphStore(selectIsWorkingCopy);

  return (
    <div className="flex h-full flex-col">
      {detailsError && <ErrorText>{detailsError}</ErrorText>}
      <div className="min-h-0 flex-1">
        <Group orientation="horizontal">
          <Panel defaultSize="256px" minSize="15%">
            <div className="h-full overflow-auto">
              {files.map((file) => (
                <FileRow
                  key={file.path}
                  file={file}
                  selected={file.path === selectedPath}
                  reviewable={reviewable}
                />
              ))}
            </div>
          </Panel>
          <Handle orientation="horizontal" />
          <Panel minSize="20%">
            <DiffView key={selectedId} files={files} reviewable={reviewable} />
          </Panel>
        </Group>
      </div>
      <StatusBar className="flex gap-3">
        <span>
          <KeyBadge>j</KeyBadge> <KeyBadge>k</KeyBadge> jump to file
        </span>
        <span>
          <KeyBadge>[</KeyBadge> <KeyBadge>]</KeyBadge> navigate hunks
        </span>
        {reviewable && (
          <>
            <span>
              <KeyBadge>Space</KeyBadge> review hunk
            </span>
            <span>
              <KeyBadge>R</KeyBadge> review file
            </span>
            <span>
              <KeyBadge>u</KeyBadge> next unreviewed
            </span>
          </>
        )}
      </StatusBar>
    </div>
  );
}
