import type { ComponentProps } from "react";

import { FIELD } from "@/ui/components/field";

export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input spellCheck={false} className={`${FIELD} font-mono ${className}`} {...props} />;
}
