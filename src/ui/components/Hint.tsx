import type { ReactNode } from "react";

import { KeyBadge } from "@/ui/components/KeyBadge";

export function Hint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key) => (
        <KeyBadge key={key}>{key}</KeyBadge>
      ))}
      {children}
    </span>
  );
}
