import { useEffect, useMemo, useRef } from "react";
import { useDraggable } from "@dnd-kit/react";

import { KeyBadge } from "@/components/KeyBadge";
import { ReviewDot } from "@/components/ReviewDot";
import { hunkState, segments } from "@/review/hunks";
import { useGraphStore } from "@/store/graph";
import { FileStatus, LineKind, type DiffLine, type FileView } from "@/types";

const TOKEN_CLASS: Record<string, string> = {
  keyword: "text-purple-700 dark:text-purple-300",
  stringlit: "text-amber-700 dark:text-amber-300",
  comment: "text-zinc-500",
  number: "text-orange-700 dark:text-orange-300",
  type: "text-teal-700 dark:text-teal-300",
  function: "text-sky-700 dark:text-sky-300",
  variable: "text-fg",
  operator: "text-dim",
  punctuation: "text-dim",
  attribute: "text-yellow-700 dark:text-yellow-300",
};

const LINE_CLASS: Record<LineKind, string> = {
  [LineKind.Context]: "",
  [LineKind.Added]: "bg-added",
  [LineKind.Removed]: "bg-removed",
  [LineKind.Separator]: "text-zinc-500 italic",
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
      <span className="w-10 shrink-0 pr-1 text-right text-zinc-500 select-none">{line.old}</span>
      <span className="w-10 shrink-0 pr-1 text-right text-zinc-500 select-none">{line.new}</span>
      <span className="w-4 shrink-0 text-zinc-500 select-none">{SIGN[line.kind]}</span>
      <span className="whitespace-pre">
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
  const movable = reviewable && !file.binary && (file.status === FileStatus.Modified || file.status === FileStatus.Added);
  const { isDragSource } = useDraggable({
    id: `hunk:${file.path}:${group}`,
    element: ref,
    disabled: !movable,
    data: { source: { kind: "hunk", path: file.path, digest: file.digests[group] } },
  });
  useEffect(() => {
    if (isCursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [isCursor]);

  const pos = { path: file.path, group };
  return (
    <div
      ref={ref}
      onClick={() => useGraphStore.getState().setCursor(pos)}
      className={`flex ${isCursor ? "ring-1 ring-accent ring-inset" : ""} ${isDragSource ? "opacity-40" : ""}`}
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
          {isCursor && <KeyBadge>r</KeyBadge>}
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

function FileDiff({ file, reviewable }: { file: FileView; reviewable: boolean }) {
  const blocks = useMemo(
    () => (file.binary ? [{ group: 0, lines: [] }] : segments(file.lines)),
    [file],
  );
  return (
    <section className="w-max min-w-full">
      <div className="sticky top-0 z-10 border-b border-line bg-canvas px-2 py-1 font-sans">
        {file.path}
      </div>
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
