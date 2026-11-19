import { useEffect, useRef } from "react";
import { Group, Panel } from "react-resizable-panels";

import type { DragObject } from "@/core/dnd/objects";
import { fileState } from "@/core/hunks";
import { useDragObject } from "@/hooks/useDragObject";
import { useDiffStore } from "@/store/diff";
import { useIsWorkingCopy, useSelectedChange, useSelectionStore } from "@/store/selection";
import { FileStatus, type FileView } from "@/types";
import { ErrorText } from "@/ui/components/ErrorText";
import { Handle } from "@/ui/components/Handle";
import { KeyBadge } from "@/ui/components/KeyBadge";
import { ListRow } from "@/ui/components/ListRow";
import { StatusBar } from "@/ui/components/StatusBar";
import { DiffSummary } from "@/ui/widgets/DiffSummary";
import { DiffView } from "@/ui/widgets/DiffView";
import { ReviewDot } from "@/ui/widgets/ReviewDot";
import { TrashZone } from "@/ui/widgets/TrashZone";

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
  const state = useDiffStore((s) => fileState(file, s.marks));
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
      onClick={() => useSelectionStore.getState().clickFile(file.path)}
      {...dragAttributes}
      className="flex items-center gap-2 px-2 py-1"
    >
      {reviewable &&
        (state ? (
          <ReviewDot
            state={state}
            onClick={() => {
              useSelectionStore.getState().selectFile(file.path);
              void useSelectionStore.getState().toggleFile(file.path);
            }}
          />
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
  const selectedId = useSelectionStore((s) => s.selection?.change);

  return (
    <div className="relative h-full">
      {selectedId ? <Details /> : <div className="p-2 text-muted">Select a change in the graph.</div>}
      <TrashZone />
    </div>
  );
}

function Details() {
  const selectedId = useSelectionStore((s) => s.selection?.change);
  const files = useDiffStore((s) => s.files);
  const selectedPath = useSelectionStore((s) => s.selection?.file?.path);
  const detailsError = useDiffStore((s) => s.detailsError);
  const reviewable = useIsWorkingCopy();

  return (
    <div className="flex h-full flex-col">
      {detailsError && <ErrorText>{detailsError}</ErrorText>}
      <div className="min-h-0 flex-1">
        <Group orientation="horizontal">
          <Panel defaultSize="256px" minSize="15%">
            <div className="h-full overflow-auto">
              <DiffSummary files={files} />
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
      <StatusBar className="flex gap-6">
        <div className="flex gap-3">
          <span>
            <KeyBadge>j</KeyBadge> <KeyBadge>k</KeyBadge> navigate files
          </span>
          {reviewable && (
            <span>
              <KeyBadge>R</KeyBadge> review file
            </span>
          )}
          <span>
            <KeyBadge>c</KeyBadge> collapse file
          </span>
        </div>
        <div className="flex gap-3">
          <span>
            <KeyBadge>[</KeyBadge> <KeyBadge>]</KeyBadge> navigate hunks
          </span>
          {reviewable && (
            <>
              <span>
                <KeyBadge>u</KeyBadge> next unreviewed
              </span>
              <span>
                <KeyBadge>Space</KeyBadge> review hunk
              </span>
            </>
          )}
        </div>
      </StatusBar>
    </div>
  );
}
