import type { ComponentProps } from "react";

export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      spellCheck={false}
      className={`rounded bg-subtle px-2 py-1 font-mono outline-none focus:ring-1 focus:ring-muted ${className}`}
      {...props}
    />
  );
}
