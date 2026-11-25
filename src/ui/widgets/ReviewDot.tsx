import { HunkState } from "@/core/hunks";

const STYLE: Record<HunkState, { className: string; title: string }> = {
  [HunkState.Reviewed]: { className: "border-success bg-success", title: "Reviewed" },
  [HunkState.Changed]: { className: "border-warning bg-warning", title: "Changed since review" },
  [HunkState.Unreviewed]: { className: "border-muted", title: "Not reviewed" },
};

const SIZE = "size-3 shrink-0";

export function ReviewDot({ state, quiet = false, onClick }: {
  state: HunkState | null;
  quiet?: boolean;
  onClick: () => void;
}) {
  if (!state) return <span className={SIZE} />;

  const { className, title } = STYLE[state];
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      data-quiet={(quiet && state === HunkState.Reviewed) || undefined}
      className={`relative ${SIZE} rounded-full border before:absolute before:top-1/2 before:left-1/2 before:size-target before:-translate-1/2 before:content-[''] ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    />
  );
}
