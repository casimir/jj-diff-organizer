import type { ComponentProps } from "react";

export function Header({ className = "", ...props }: ComponentProps<"header">) {
  return (
    <header
      className={`flex h-(--diff-header-h) shrink-0 items-center justify-between gap-2 border-b px-3 font-sans ${className}`}
      {...props}
    />
  );
}
