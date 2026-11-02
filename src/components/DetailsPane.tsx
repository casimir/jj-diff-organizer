import { useRef } from "react";
import { useDraggable } from "@dnd-kit/react";
import { Group, Panel } from "react-resizable-panels";

import { DiffView } from "@/components/DiffView";
import { Handle } from "@/components/Handle";
import { KeyBadge } from "@/components/KeyBadge";
import { ReviewDot } from "@/components/ReviewDot";
import { fileState } from "@/review/hunks";
import { SelectMode, selectIsWorkingCopy, useGraphStore } from "@/store/graph";
import { FileStatus, type FileView } from "@/types";

const STATUS: Record<FileStatus, { letter: string; className: string }> = {
  [FileStatus.Added]: { letter: "A", className: "text-green-700 dark:text-green-400" },
  [FileStatus.Modified]: { letter: "M", className: "text-accent" },
  [FileStatus.Deleted]: { letter: "D", className: "text-danger" },
  [FileStatus.Renamed]: { letter: "R", className: "text-purple-700 dark:text-purple-400" },
};

function FileRow({ file, selected, active, reviewable }: {
  file: FileView;
  selected: boolean;
  active: boolean;
  reviewable: boolean;
}) {
  const state = useGraphStore((s) => fileState(file, s.marks));
  const ref = useRef<HTMLDivElement>(null);
  const { isDragSource } = useDraggable({
    id: `file:${file.path}`,
    element: ref,
    disabled: !reviewable,
    data: { source: { kind: "file", path: file.path } },
  });
  const name = file.path.split("/").pop();
  const { letter, className } = STATUS[file.status];
  return (
    <div
      ref={ref}
      onClick={(e) =>
        useGraphStore
          .getState()
          .selectFile(file.path, e.shiftKey ? SelectMode.Range : e.metaKey || e.ctrlKey ? SelectMode.Toggle : SelectMode.Replace)
      }
      className={`flex items-center gap-2 px-2 py-1 ${selected ? "bg-selected" : "hover:bg-subtle"} ${
        isDragSource ? "opacity-40" : ""
      }`}
    >
      {reviewable &&
        (state ? (
          <>
            <ReviewDot state={state} onClick={() => void useGraphStore.getState().toggleFile(file.path)} />
            {active && <KeyBadge>R</KeyBadge>}
          </>
        ) : (
          <span className="size-3 shrink-0" />
        ))}
      <span className={`shrink-0 font-mono ${className}`}>{letter}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate">{name}</div>
        <div className="truncate text-xs text-zinc-500">{file.path}</div>
      </div>
    </div>
  );
}

export function DetailsPane() {
  const selectedId = useGraphStore((s) => s.selectedId);
  const files = useGraphStore((s) => s.files);
  const selectedPath = useGraphStore((s) => s.selectedPath);
  const selectedPaths = useGraphStore((s) => s.selectedPaths);
  const detailsError = useGraphStore((s) => s.detailsError);
  const reviewable = useGraphStore(selectIsWorkingCopy);
  const shown = files.filter((f) => selectedPaths.includes(f.path));

  if (!selectedId) return <div className="p-2 text-zinc-500">Select a change in the graph.</div>;
  return (
    <div className="flex h-full flex-col">
      {detailsError && <pre className="p-2 whitespace-pre-wrap text-danger">{detailsError}</pre>}
      <div className="min-h-0 flex-1">
        <Group orientation="horizontal">
          <Panel defaultSize="35%" minSize="15%">
            <div className="h-full overflow-auto">
              {files.map((file) => (
                <FileRow
                  key={file.path}
                  file={file}
                  selected={selectedPaths.includes(file.path)}
                  active={file.path === selectedPath}
                  reviewable={reviewable}
                />
              ))}
            </div>
          </Panel>
          <Handle orientation="horizontal" />
          <Panel minSize="20%">
            <DiffView files={shown} reviewable={reviewable} />
          </Panel>
        </Group>
      </div>
      <footer className="flex shrink-0 gap-3 border-t border-line px-2 py-0.5 text-zinc-500">
        <span>
          <KeyBadge>j</KeyBadge> <KeyBadge>k</KeyBadge> files
        </span>
        <span>
          <KeyBadge>[</KeyBadge> <KeyBadge>]</KeyBadge> hunks
        </span>
        <span>
          <KeyBadge>a</KeyBadge> all files
        </span>
        {reviewable && (
          <span>
            <KeyBadge>u</KeyBadge> next unreviewed
          </span>
        )}
      </footer>
    </div>
  );
}
