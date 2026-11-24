import { useEffect, useMemo, useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { DragObject } from "@/core/dnd/objects";
import { diffStat, fileState, hunkState, isCollapsed } from "@/core/hunks";
import { sameLeaf, showsHunks } from "@/core/selection";
import { useDragObject } from "@/hooks/useDragObject";
import { useDiffStore } from "@/store/diff";
import { useSelectedChange, useSelectionStore } from "@/store/selection";
import { BlockKind, FileStatus, LineKind, type DiffLine, type FileView } from "@/types";
import { CopyButton } from "@/ui/components/CopyButton";
import { Header } from "@/ui/components/Header";
import { DiffStat } from "@/ui/widgets/DiffStat";
import { ReviewDot } from "@/ui/widgets/ReviewDot";

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

function Hunk({ file, hunkKey, lines, reviewable }: {
  file: FileView;
  hunkKey: string;
  lines: DiffLine[];
  reviewable: boolean;
}) {
  const state = useDiffStore((s) => hunkState(file, s.marks, hunkKey));
  const pos = { path: file.path, key: hunkKey };
  const selected = useSelectionStore((s) => sameLeaf(s.selection?.file, { path: file.path, hunk: hunkKey }));
  const ref = useRef<HTMLDivElement>(null);
  const change = useSelectedChange();
  const movable =
    !!change && !change.immutable && !file.binary && (file.status === FileStatus.Modified || file.status === FileStatus.Added);
  const object: DragObject | undefined = change && {
    kind: "hunk",
    from: change,
    ...pos,
  };
  const dragAttributes = useDragObject(`hunk:${file.path}:${hunkKey}`, ref, object, !movable);

  return (
    <div
      ref={ref}
      onClick={() => useSelectionStore.getState().selectHunk(file.path, hunkKey)}
      {...dragAttributes}
      data-leaf=""
      data-path={file.path}
      data-hunk={hunkKey}
      data-selected={selected || undefined}
      className="flex scroll-mt-[calc(var(--diff-header-h)+1lh)] scroll-mb-[1lh]"
    >
      <div className={`${RAIL} flex items-center justify-center`}>
        {reviewable && (
          <ReviewDot
            state={state}
            onClick={() => {
              useSelectionStore.getState().selectHunk(file.path, hunkKey);
              void useSelectionStore.getState().toggleHunk();
            }}
          />
        )}
      </div>
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
  const stat = useMemo(() => diffStat([file]), [file]);
  const collapsed = useDiffStore((s) => isCollapsed(file, s.marks, s.collapse, reviewable));
  const state = useDiffStore((s) => fileState(file, s.marks));
  const selected = useSelectionStore((s) => sameLeaf(s.selection?.file, { path: file.path }));
  const isLeaf = !showsHunks(file, collapsed);
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <section data-path={file.path}>
      <Header
        data-leaf={isLeaf ? "" : undefined}
        data-path={file.path}
        data-selected={selected || undefined}
        onClick={() => {
          useSelectionStore.getState().selectFile(file.path);
          useSelectionStore.getState().toggleCollapse(file.path);
        }}
        className="sticky top-0 z-(--z-sticky) cursor-pointer border-line bg-subtle"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Chevron className="size-3.5 shrink-0 text-muted" />
          {reviewable && state && (
            <ReviewDot
              state={state}
              onClick={() => {
                useSelectionStore.getState().selectFile(file.path);
                void useSelectionStore.getState().toggleFile(file.path);
              }}
            />
          )}
          <FileTitle file={file} />
          {file.generated && <span className="text-muted">generated</span>}
          <CopyButton text={file.path} label="Copy path" onError={useDiffStore.getState().reportDetailsError} />
        </div>
        {!file.binary && <DiffStat {...stat} />}
      </Header>
      {!collapsed && (
        <>
          {file.blocks.length === 0 && (
            <div className="px-2 py-1 text-dim">{file.binary ? "Binary file" : "No content changes"}</div>
          )}
          {file.blocks.map((block, i) =>
            block.kind === BlockKind.Line ? (
              <div key={i} className="flex">
                <div className={RAIL} />
                <div className="min-w-0 flex-1">
                  <Line line={block.line} />
                </div>
              </div>
            ) : (
              <Hunk key={i} file={file} hunkKey={block.key} lines={block.lines} reviewable={reviewable} />
            ),
          )}
        </>
      )}
    </section>
  );
}

export function DiffView({ files, reviewable }: { files: FileView[]; reviewable: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const reveal = useSelectionStore((s) => s.reveal);
  const marks = useDiffStore((s) => s.marks);
  const collapse = useDiffStore((s) => s.collapse);

  useEffect(() => {
    const selected = container.current?.querySelector("[data-selected]");
    if (reveal?.target === "file") {
      selected?.closest("section")?.scrollIntoView({ block: "start" });
    } else if (reveal) {
      selected?.scrollIntoView({ block: "nearest" });
    }
  }, [reveal]);

  useEffect(() => {
    const root = container.current;
    if (!root) return;

    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.add(entry.target);
          } else {
            visible.delete(entry.target);
          }
        }
        const leaves = Array.from(root.querySelectorAll<HTMLElement>("[data-leaf]")).flatMap((el) =>
          visible.has(el) && el.dataset.path ? [{ path: el.dataset.path, hunk: el.dataset.hunk }] : [],
        );
        useSelectionStore.getState().scrolled(leaves);
      },
      { root },
    );
    root.querySelectorAll("[data-leaf]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [files, marks, collapse]);

  return (
    <div ref={container} className="h-full overflow-auto font-mono">
      {files.map((file) => (
        <FileDiff key={file.path} file={file} reviewable={reviewable} />
      ))}
    </div>
  );
}
