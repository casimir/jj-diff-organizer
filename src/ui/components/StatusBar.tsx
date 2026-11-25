import type { ReactNode } from "react";

export function StatusBar({ className = "", children }: { className?: string; children: ReactNode }) {
  return <footer className={`flex shrink-0 flex-wrap items-center gap-x-3 border-t border-line px-2 py-0.5 text-muted ${className}`}>{children}</footer>;
}
