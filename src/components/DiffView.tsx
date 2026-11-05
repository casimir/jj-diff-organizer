import { useEffect, useMemo, useRef } from "react";

import { ReviewDot } from "@/components/ReviewDot";
import type { DragSource } from "@/graph/drop";
import { useDragSource } from "@/hooks/useDragSource";
import { hunkState, segments } from "@/review/hunks";
import { selectSelectedChange, useGraphStore } from "@/store/graph";
import { FileStatus, LineKind, type DiffLine, type FileView } from "@/types";

const TOKEN_CLASS: Record<string, string> = {
  keyword: "text-syntax-keyword",
  stringlit: "text-syntax-string",
  comment: "text-muted",
  number: "text-syntax-number",
  type: "text-syntax-type",
  function: "text-syntax-function",
  variable: "text-fg",
  operator: "text-dim",
  punctuation: "text-dim",
  attribute: "text-syntax-attribute",
};

const LINE_CLASS: Record<LineKind, string> = {
  [LineKind.Context]: "",
  [LineKind.Added]: "bg-added",
  [LineKind.Removed]: "bg-removed",
  [LineKind.Separator]: "text-muted italic",
};

const SIGN: Record<LineKind, string> = {
  [LineKind.Context]: " ",
  [LineKind.Added]: "+",
  [LineKind.Removed]: "-",
  [LineKind.Separator]: " ",
};

function Line({ line }: { line: DiffLine }) {
  if (line.kind === LineKind.Separator) {
    return <div className={`px-2 ${LINE_CLASS[line.kind]}`}>{line.spans.map((s) => s.text).join("")}</div>;
  }
  return (
    <div className={`flex ${LINE_CLASS[line.kind]}`}>
      <span className="w-10 shrink-0 pr-1 text-right text-muted select-none">{line.old}</span>
      <span className="w-10 shrink-0 pr-1 text-right text-muted select-none">{line.new}</span>
      <span className="w-4 shrink-0 text-muted select-none">{SIGN[line.kind]}</span>
      <span className="min-w-0 whitespace-pre-wrap break-all">
        {line.spans.map((s, i) => (
          <span key={i} className={TOKEN_CLASS[s.token]}>
            {s.text}
          </span>
        ))}
      </span>
    </div>
  );
}

const RAIL = "w-8 shrink-0";

function Hunk({ file, group, lines, reviewable }: {
  file: FileView;
  group: number;
  lines: DiffLine[];
  reviewable: boolean;
}) {
  const state = useGraphStore((s) => hunkState(file, s.marks, group));
  const isCursor = useGraphStore((s) => s.cursor?.path === file.path && s.cursor.group === group);
  const ref = useRef<HTMLDivElement>(null);
  const change = useGraphStore(selectSelectedChange);
  const movable =
    !!change && !change.immutable && !file.binary && (file.status === FileStatus.Modified || file.status === FileStatus.Added);
  const source: DragSource | undefined = change && {
    kind: "hunk",
    from: change,
    path: file.path,
    digest: file.digests[group],
  };
  const dragAttributes = useDragSource(`hunk:${file.path}:${group}`, ref, source, !movable);
  useEffect(() => {
    if (isCursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [isCursor]);

  const pos = { path: file.path, group };
  return (
    <div
      ref={ref}
      onClick={() => useGraphStore.getState().setCursor(pos)}
      {...dragAttributes}
      data-cursor={isCursor || undefined}
      className="flex scroll-mt-[calc(var(--diff-header-h)+1lh)] scroll-mb-[1lh]"
    >
      {reviewable && (
        <div className={`${RAIL} flex flex-col items-center gap-1 pt-1`}>
          <ReviewDot
            state={state}
            onClick={() => {
              useGraphStore.getState().setCursor(pos);
              void useGraphStore.getState().toggleHunk();
            }}
          />
        </div>
      )}
      <div className="min-w-0 flex-1">
        {file.binary ? (
          <div className="px-2 py-1 text-dim">Binary file</div>
        ) : (
          lines.map((line, i) => <Line key={i} line={line} />)
        )}
      </div>
    </div>
  );
}

function FileTitle({ file }: { file: FileView }) {
  if (!file.old_path) return file.path;
  if (file.status === FileStatus.Renamed) {
    return (
      <>
        <span className="text-muted">{file.old_path} → </span>
        {file.path}
      </>
    );
  }
  return (
    <>
      {file.path} <span className="text-muted">(copied from {file.old_path})</span>
    </>
  );
}

function FileDiff({ file, reviewable }: { file: FileView; reviewable: boolean }) {
  const blocks = useMemo(
    () => (file.binary ? [{ group: 0, lines: [] }] : segments(file.lines)),
    [file],
  );
  return (
    <section>
      <div className="sticky top-0 z-(--z-sticky) flex h-(--diff-header-h) items-center border-b border-line bg-canvas px-2 font-sans">
        <FileTitle file={file} />
      </div>
      {blocks.length === 0 && <div className="px-2 py-1 text-dim">No content changes</div>}
      {blocks.map((block, i) =>
        block.group === null ? (
          <div key={i} className="flex">
            {reviewable && <div className={RAIL} />}
            <div className="min-w-0 flex-1">
              <Line line={block.lines[0]} />
            </div>
          </div>
        ) : (
          <Hunk key={i} file={file} group={block.group} lines={block.lines} reviewable={reviewable} />
        ),
      )}
    </section>
  );
}

export function DiffView({ files, reviewable }: { files: FileView[]; reviewable: boolean }) {
  return (
    <div className="h-full overflow-auto font-mono">
      {files.map((file) => (
        <FileDiff key={file.path} file={file} reviewable={reviewable} />
      ))}
    </div>
  );
}
