# glob-hash

Compute a SHA-256 hash from files matched by glob patterns.

Available as a [Deno](https://deno.com) package on
[jsr.io](https://jsr.io/@dx/glob-hash).

## Install

```sh
deno add @dx/glob-hash
```

Or import directly without installing:

```ts
import { computeHash } from 'jsr:@dx/glob-hash';
```

## Usage

```ts
import { computeHash } from '@dx/glob-hash';

// Hash file metadata — fast (default)
const hash = await computeHash({
  include: ['src/**/*.ts', '**/*.json'],
  exclude: ['deno.json'],
});
console.log(hash); // "3b4c…" (64-char hex)

// Hash file contents — accurate, reads every file
const contentHash = await computeHash({
  include: ['src/**/*.ts'],
  content: true,
});

// Return matched file paths instead of a hash
const files = await computeHash({
  include: ['src/**/*.ts'],
  files: true,
});
console.log(files); // ["src/mod.ts", "src/types.ts", "src/utils.ts"]
```

## API

### `computeHash(options: IOptions): Promise<string>`

### `computeHash(options: IOptions & { files: true }): Promise<string[]>`

Checks the include patterns against the jail, walks them once while skipping
exclude matches, deduplicates, verifies that every matched file is still inside
the jail, sorts deterministically, then either returns the matched file paths or
a hex-encoded SHA-256 hash. The return type follows `options.files`, so no cast
is needed at the call site.

### Options

| Option    | Type       | Default | Description                                                                      |
| --------- | ---------- | ------- | -------------------------------------------------------------------------------- |
| `include` | `string[]` | —       | Glob patterns for files to hash. **Required.**                                   |
| `exclude` | `string[]` | `[]`    | Glob patterns for files to exclude.                                              |
| `jail`    | `string`   | `"."`   | Directory that patterns resolve against and may not leave. Throws otherwise.     |
| `files`   | `boolean`  | `false` | Return matched file paths (relative to `jail`) instead of a hash.                |
| `content` | `boolean`  | `false` | Hash file **contents** instead of metadata. More accurate, but reads every file. |

## Hash format

The exact construction is **part of the public API**. Changing it changes every
hash this package has ever returned, so it only changes in a major release.

Matched files are sorted by absolute path. Each file becomes one line:

```text
<path relative to jail, forward slashes> <SHA-256 of the file's body, lowercase hex>
```

where _body_ is the raw file bytes in content mode, and the UTF-8 string
`` `${dev}-${ino}-${size}-${mtime}` `` in metadata mode. Those lines are joined
with `\n` and the result is the SHA-256 of that string, as lowercase hex.

Including the path means a rename changes the hash; hashing each file
separately means file boundaries are unambiguous, so `"ab" + "c"` and
`"a" + "bc"` do not collide.

### Notes

- **Metadata mode** is fast because no file content is read. On **Windows**,
  `dev` and `ino` are always `0`, so the hash reflects `size + mtime` only.
  Because `dev`/`ino`/`mtime` differ per machine and per checkout, a metadata
  hash is only comparable on the machine that produced it — use `content: true`
  for a key shared across machines or CI runners.
- **Content mode** reads every matched file in full — reliable for detecting
  byte-level changes regardless of filesystem metadata.
- `jail` is both the base that relative patterns resolve against and the
  boundary they may not cross — useful when the patterns come from a config
  file or any other input you do not control. A pattern that points outside is
  rejected **before** anything is read, so an escaping pattern cannot walk a
  tree it is barred from. Files that slip past that — through a symlink — are
  caught by a second check that canonicalizes both sides with `Deno.realPath`,
  which also means a symlinked jail root causes no false positives.
- Symlinks pointing at files are followed and hashed. Symlinked _directories_
  are never traversed: `walk()` keeps no record of visited paths, so a link
  cycle would not terminate.
- All hashes are SHA-256, computed with the built-in
  [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API).
- No third-party dependencies — only `@std/fs` and `@std/path` from the Deno
  standard library.

## License

MIT
