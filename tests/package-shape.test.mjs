import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("package exposes the orgm limits Pi extension", () => {
  assert.equal(pkg.name, "pi-limit");
  assert.deepEqual(pkg.pi.extensions, ["./extensions/limit.ts"]);
  assert.ok(pkg.description.includes("/orgm-limits"));
});
