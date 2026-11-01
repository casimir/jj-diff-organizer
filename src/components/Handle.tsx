import { Separator } from "react-resizable-panels";

export function Handle({ orientation }: { orientation: "horizontal" | "vertical" }) {
  const size = orientation === "horizontal" ? "w-1" : "h-1";
  return <Separator className={`${size} shrink-0 bg-zinc-800 hover:bg-zinc-600`} />;
}
