export function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-zinc-600 px-1 font-mono text-[11px] leading-4 text-zinc-300">
      {children}
    </kbd>
  );
}
