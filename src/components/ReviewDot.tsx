import { HunkState } from "@/review/hunks";

const STYLE: Record<HunkState, { className: string; title: string }> = {
  [HunkState.Reviewed]: { className: "border-success bg-success", title: "Reviewed" },
  [HunkState.Changed]: { className: "border-warning bg-warning", title: "Changed since review" },
  [HunkState.Unreviewed]: { className: "border-muted", title: "Not reviewed" },
};

export function ReviewDot({ state, onClick }: { state: HunkState; onClick: () => void }) {
  const { className, title } = STYLE[state];
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`size-3 shrink-0 rounded-full border ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    />
  );
}
