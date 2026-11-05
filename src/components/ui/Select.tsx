import type { ComponentProps } from "react";

import { FIELD } from "@/components/ui/field";

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select className={`${FIELD} ${className}`} {...props} />;
}
