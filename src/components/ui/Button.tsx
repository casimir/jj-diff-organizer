import type { ComponentProps } from "react";

export const ButtonVariant = {
  Solid: "solid",
  Ghost: "ghost",
} as const;
export type ButtonVariant = (typeof ButtonVariant)[keyof typeof ButtonVariant];

const VARIANT: Record<ButtonVariant, string> = {
  [ButtonVariant.Solid]: "bg-selected px-3 py-1 hover:bg-strong",
  [ButtonVariant.Ghost]: "px-2 text-muted hover:bg-selected hover:text-fg",
};

export function Button({ variant = ButtonVariant.Solid, className = "", ...props }: ComponentProps<"button"> & {
  variant?: ButtonVariant;
}) {
  return <button type="button" className={`min-h-target min-w-target rounded ${VARIANT[variant]} ${className}`} {...props} />;
}
