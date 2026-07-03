import test from "node:test";
import assert from "node:assert/strict";
import { getAppDataDir } from "../src/storage/index.js";

test("getAppDataDir returns a non-empty path", () => {
  assert.ok(getAppDataDir().length > 5);
});
