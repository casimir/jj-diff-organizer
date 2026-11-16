import type { ReactNode } from "react";

export function ErrorText({ className = "", children }: { className?: string; children: ReactNode }) {
  return <pre className={`bg-removed p-2 whitespace-pre-wrap text-danger ${className}`}>{children}</pre>;
}
