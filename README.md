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

### `computeHash(options: IOptions): Promise<string | string[]>`

Resolves all include globs, removes exclude matches, deduplicates, verifies the
optional jail constraint, sorts deterministically, then either returns the
matched file paths or a hex-encoded SHA-256 hash.

### Options

| Option    | Type       | Default | Description                                                                      |
| --------- | ---------- | ------- | -------------------------------------------------------------------------------- |
| `include` | `string[]` | —       | Glob patterns for files to hash. **Required.**                                   |
| `exclude` | `string[]` | `[]`    | Glob patterns for files to exclude.                                              |
| `jail`    | `string`   | `"."`   | Restrict access to this directory. Throws if any matched file is outside.        |
| `files`   | `boolean`  | `false` | Return matched file paths (relative to `jail`) instead of a hash.                |
| `content` | `boolean`  | `false` | Hash file **contents** instead of metadata. More accurate, but reads every file. |

### Notes

- **Metadata mode** hashes `dev + ino + size + mtime` per file. Fast because no
  file content is read. On **Windows**, `dev` and `ino` are always `0`, so the
  hash reflects `size + mtime` only.
- **Content mode** reads every matched file in full — reliable for detecting
  byte-level changes regardless of filesystem metadata.
- All hashes are SHA-256, returned as 64-character lowercase hex strings (via
  the built-in
  [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)).
- No third-party dependencies — only `@std/fs` and `@std/path` from the Deno
  standard library.

## License

MIT
