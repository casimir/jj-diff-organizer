import { describe, expect, it } from "vitest";

import { groupFiles } from "@/core/files";
import { file } from "@/fixtures";
import { FileStatus } from "@/types";

describe("groupFiles", () => {
  it("sorts directories by path, puts root files last and keeps the order within a group", () => {
    const groups = groupFiles([
      file("README.md", ["r"]),
      file("src/ui/b.ts", ["b"]),
      file("src/a.ts", ["a"]),
      file("src/ui/a.ts", ["a"]),
      file("Cargo.toml", ["c"]),
    ]);

    expect(groups.map((g) => [g.dir, g.files.map((f) => f.path)])).toEqual([
      ["src", ["src/a.ts"]],
      ["src/ui", ["src/ui/b.ts", "src/ui/a.ts"]],
      [null, ["README.md", "Cargo.toml"]],
    ]);
  });

  it("groups a renamed file by its new path", () => {
    const renamed = file("new/a.ts", ["a"], { status: FileStatus.Renamed, old_path: "old/a.ts" });
    expect(groupFiles([renamed]).map((g) => g.dir)).toEqual(["new"]);
  });
});
