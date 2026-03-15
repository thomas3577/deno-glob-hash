import { assert, assertEquals, assertMatch, assertRejects } from "@std/assert";
import { computeHash } from "./mod.ts";

Deno.test("returns a 64-char hex hash (metadata mode)", async () => {
  const result = await computeHash({ include: ["src/**/*.ts"] });
  assertMatch(result as string, /^[0-9a-f]{64}$/);
});

Deno.test("returns a 64-char hex hash (content mode)", async () => {
  const result = await computeHash({ include: ["src/**/*.ts"], content: true });
  assertMatch(result as string, /^[0-9a-f]{64}$/);
});

Deno.test("metadata and content mode produce different hashes", async () => {
  const meta = await computeHash({ include: ["src/**/*.ts"] }) as string;
  const content = await computeHash({
    include: ["src/**/*.ts"],
    content: true,
  }) as string;
  assert(meta !== content, "metadata and content hashes should differ");
});

Deno.test("hash is deterministic across calls", async () => {
  const a = await computeHash({ include: ["src/**/*.ts"] });
  const b = await computeHash({ include: ["src/**/*.ts"] });
  assertEquals(a, b);
});

Deno.test("files: true returns an array of .ts paths", async () => {
  const result = await computeHash({ include: ["src/**/*.ts"], files: true });
  assert(Array.isArray(result));
  assert((result as string[]).length > 0);
  assert((result as string[]).every((f) => f.endsWith(".ts")));
});

Deno.test("exclude removes files from the result", async () => {
  const all = await computeHash({
    include: ["src/**/*.ts"],
    files: true,
  }) as string[];
  const without = await computeHash({
    include: ["src/**/*.ts"],
    exclude: ["**/utils.ts"],
    files: true,
  }) as string[];
  assert(without.length < all.length);
  assert(!without.some((f) => f.endsWith("utils.ts")));
});

Deno.test("throws when no files match", async () => {
  await assertRejects(
    () => computeHash({ include: ["**/*.nonexistent_xyz_abc"] }),
    Error,
    "No files were matched",
  );
});

Deno.test("throws on jail violation", async () => {
  // deno.json is in the repo root; jailing to src/ should trigger an error.
  await assertRejects(
    () => computeHash({ include: ["deno.json"], jail: "./src" }),
    Error,
    "outside the permitted path",
  );
});
