import { useEffect, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, Copy } from "lucide-react";

import { Button, ButtonVariant } from "@/components/ui/Button";

const FEEDBACK_MS = 1500;

export function CopyButton({ text, label, onError }: {
  text: string;
  label: string;
  onError: (e: unknown) => void;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(() => setCopied(false), FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const Icon = copied ? Check : Copy;
  return (
    <Button
      variant={ButtonVariant.Ghost}
      title={label}
      aria-label={label}
      onClick={() => writeText(text).then(() => setCopied(true), onError)}
    >
      <Icon className="size-3.5" />
    </Button>
  );
}
