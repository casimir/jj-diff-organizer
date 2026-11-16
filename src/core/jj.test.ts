import { describe, expect, it } from "vitest";

import { displayCommand } from "@/core/jj";

describe("displayCommand", () => {
  it("quotes like the Rust display_command", () => {
    expect(displayCommand(["bookmark", "set", "it's here", "--revision", "y"])).toBe(
      `jj bookmark set 'it'\\''s here' --revision y`,
    );
  });
});
