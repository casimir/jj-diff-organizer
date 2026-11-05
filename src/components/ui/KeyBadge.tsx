export function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-strong px-1 font-mono text-badge text-dim">
      {children}
    </kbd>
  );
}
