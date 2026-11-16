import { insert } from "@/core/command";
import { onto, type Handler } from "@/core/dnd/model";
import { shellQuote } from "@/core/jj";

export const terminalHandler: Handler = (object) => {
  switch (object.kind) {
    case "bookmark":
      return onto(insert(shellQuote(object.name)));
    case "change":
      return onto(insert(object.change.short));
    case "file":
      return onto(insert(shellQuote(object.path)));
    case "wc":
    case "hunk":
      return null;
  }
};
