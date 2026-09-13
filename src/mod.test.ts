import { assert, assertEquals, assertMatch, assertNotEquals, assertRejects } from '@std/assert';
import { computeHash } from './mod.ts';
import { isAbsolute } from '@std/path';

/** Creates a fixture directory inside the cwd and removes it afterwards. */
const withFixture = async (files: Record<string, string>, fn: (dir: string) => Promise<void>) => {
  const dir = await Deno.makeTempDir({ dir: '.' });
  try {
    for (const [name, content] of Object.entries(files)) {
      await Deno.writeTextFile(`${dir}/${name}`, content);
    }
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

Deno.test('returns a 64-char hex hash (metadata mode)', async () => {
  const result = await computeHash({ include: ['src/**/*.ts'] });
  assertMatch(result, /^[0-9a-f]{64}$/);
});

Deno.test('returns a 64-char hex hash (content mode)', async () => {
  const result = await computeHash({ include: ['src/**/*.ts'], content: true });
  assertMatch(result, /^[0-9a-f]{64}$/);
});

Deno.test('metadata and content mode produce different hashes', async () => {
  const meta = await computeHash({ include: ['src/**/*.ts'] });
  const content = await computeHash({ include: ['src/**/*.ts'], content: true });
  assertNotEquals(meta, content);
});

Deno.test('hash is deterministic across calls', async () => {
  const a = await computeHash({ include: ['src/**/*.ts'] });
  const b = await computeHash({ include: ['src/**/*.ts'] });
  assertEquals(a, b);
});

Deno.test('files: true returns an array of .ts paths', async () => {
  const result = await computeHash({ include: ['src/**/*.ts'], files: true });
  assert(result.length > 0);
  assert(result.every((f) => f.endsWith('.ts')));
});

Deno.test('files: true returns paths relative to the jail', async () => {
  const result = await computeHash({ include: ['src/**/*.ts'], files: true });
  assert(result.includes('src/mod.ts'), `expected 'src/mod.ts' in ${JSON.stringify(result)}`);
});

Deno.test('files: true honours a custom jail root', async () => {
  const result = await computeHash({ include: ['src/**/*.ts'], files: true, jail: './src' });

  assert(result.length > 0);
  assert(result.every((f) => !isAbsolute(f) && !f.startsWith('..')));
  assert(result.includes('mod.ts'), `expected 'mod.ts' in ${JSON.stringify(result)}`);
});

Deno.test('exclude removes files from the result', async () => {
  const all = await computeHash({ include: ['src/**/*.ts'], files: true });
  const without = await computeHash({ include: ['src/**/*.ts'], exclude: ['**/utils.ts'], files: true });
  assert(without.length < all.length);
  assert(!without.some((f) => f.endsWith('utils.ts')));
});

Deno.test('throws when no files match', async () => {
  await assertRejects(
    () => computeHash({ include: ['**/*.nonexistent_xyz_abc'] }),
    Error,
    'No files were matched',
  );
});

Deno.test('throws on jail violation', async () => {
  // deno.json is in the repo root; jailing to src/ should trigger an error.
  await assertRejects(
    () => computeHash({ include: ['deno.json'], jail: './src' }),
    Error,
    'outside the permitted path',
  );
});

Deno.test('content hash respects file boundaries', async () => {
  await withFixture({ '1.txt': 'ab', '2.txt': 'c' }, async (dir) => {
    const a = await computeHash({ include: [`${dir}/*.txt`], content: true });
    await Deno.writeTextFile(`${dir}/1.txt`, 'a');
    await Deno.writeTextFile(`${dir}/2.txt`, 'bc');
    const b = await computeHash({ include: [`${dir}/*.txt`], content: true });
    assertNotEquals(a, b, 'concatenated content must not collide across file boundaries');
  });
});

Deno.test('content hash changes when a file is renamed', async () => {
  await withFixture({ 'a.txt': 'same' }, async (dir) => {
    const before = await computeHash({ include: [`${dir}/*.txt`], content: true });
    await Deno.rename(`${dir}/a.txt`, `${dir}/b.txt`);
    const after = await computeHash({ include: [`${dir}/*.txt`], content: true });
    assertNotEquals(before, after, 'the file path must be part of the hash');
  });
});
