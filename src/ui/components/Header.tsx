import type { ComponentProps } from "react";

export function Header({ className = "", ...props }: ComponentProps<"header">) {
  return (
    <header
      className={`flex h-(--header-h) shrink-0 items-center justify-between gap-2 border-b border-line px-2 font-sans ${className}`}
      {...props}
    />
  );
}
