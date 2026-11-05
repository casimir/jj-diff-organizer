import type { ComponentProps } from "react";

export const ChipTone = {
  Success: "success",
  Accent: "accent",
} as const;
export type ChipTone = (typeof ChipTone)[keyof typeof ChipTone];

const TONE: Record<ChipTone, string> = {
  [ChipTone.Success]: "bg-success/20 text-success",
  [ChipTone.Accent]: "bg-accent/20 text-accent",
};

export function Chip({ tone, className = "", ...props }: ComponentProps<"span"> & { tone: ChipTone }) {
  return <span className={`rounded px-1 ${TONE[tone]} ${className}`} {...props} />;
}
