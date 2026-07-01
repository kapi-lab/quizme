import test from "node:test";
import assert from "node:assert/strict";
import { getAppDataDir, slugifyProjectPath } from "../src/platform/paths.js";

test("slugifyProjectPath normalizes separators", () => {
  assert.equal(slugifyProjectPath("/Users/jy/Documents/codex_zone"), "-Users-jy-Documents-codex-zone");
});

test("getAppDataDir returns a non-empty path", () => {
  assert.ok(getAppDataDir().length > 5);
});
