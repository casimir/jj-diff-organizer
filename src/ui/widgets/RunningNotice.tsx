import { useRunStore } from "@/store/run";

export function RunningNotice() {
  const command = useRunStore((s) => s.command);
  if (!command) return null;

  return (
    <div className="fixed right-3 bottom-3 z-(--z-overlay) flex max-w-md items-center gap-2 rounded bg-canvas px-3 py-2 shadow-xl ring-(length:--indicator-width) ring-command">
      <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-command border-t-transparent" />
      <span className="truncate font-mono">{command}</span>
    </div>
  );
}
