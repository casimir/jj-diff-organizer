import type { ComponentProps } from "react";

export function ListRow({ selected = false, ...props }: ComponentProps<"div"> & { selected?: boolean }) {
  return <div data-row="" data-selected={selected || undefined} {...props} />;
}
