/**
 * Compute a SHA-256 hash from the files matched by a set of glob patterns.
 *
 * Useful as a cache key: hash a source tree once, compare it later to decide
 * whether anything needs rebuilding. Metadata mode (the default) derives the
 * key from `stat()` alone and never reads file content; content mode reads
 * every byte and is comparable across machines.
 *
 * ```ts
 * import { computeHash } from '@dx/glob-hash';
 *
 * // Fast: derived from size and mtime, valid on this machine only.
 * const key = await computeHash({ include: ['src/**'] });
 *
 * // Portable: derived from file content.
 * const portable = await computeHash({ include: ['src/**'], content: true });
 *
 * // The matched files instead of a hash.
 * const files = await computeHash({ include: ['src/**'], exclude: ['src/*.test.ts'], files: true });
 * ```
 *
 * The hash covers each file's path relative to `jail` as well as its body, so
 * renames are visible and file boundaries cannot collide. See the README for
 * the exact construction — it is part of the public API.
 *
 * @module
 */

import { resolve } from '@std/path';
import { assertInJail, assertPatternsInJail, hashFiles, relativePath, resolveGlobs } from './utils.ts';
import type { IOptions } from './types.ts';

export type { IOptions } from './types.ts';

/**
 * Computes a SHA-256 hash for all files matched by the provided glob patterns.
 *
 * @param {IOptions} options - See {@linkcode IOptions}.
 *
 * @returns {Promise<string>} A 64-character hex hash string.
 * @throws {Error} If any glob pattern is invalid, if file system access fails, if any file is outside the jail, or if no files are matched.
 */
export function computeHash(options: IOptions & { files?: false }): Promise<string>;

/**
 * Returns the list of files matched by the provided glob patterns, relative to
 * `jail` and sorted deterministically.
 *
 * @param {IOptions} options - See {@linkcode IOptions}.
 *
 * @returns {Promise<string[]>} The matched file paths, relative to `jail`.
 * @throws {Error} If any glob pattern is invalid, if file system access fails, if any file is outside the jail, or if no files are matched.
 */
export function computeHash(options: IOptions & { files: true }): Promise<string[]>;

/**
 * Computes a SHA-256 hash (or returns a file list) for all files matched by
 * the provided glob patterns.
 *
 * Files are resolved, deduplicated, jail-checked, and sorted before hashing
 * to ensure a stable, deterministic result.
 *
 * @param {IOptions} options - See {@linkcode IOptions}.
 *
 * @returns {Promise<string | string[]>} A 64-character hex hash string, or an array of file paths
 *   (relative to `jail`) when `options.files` is `true`.
 * @throws {Error} If any glob pattern is invalid, if file system access fails, if any file is outside the jail, or if no files are matched.
 */
export async function computeHash(options: IOptions): Promise<string | string[]> {
  const jailPath = resolve(options.jail ?? '.');

  // Checked before walking: an escaping pattern must not read the tree it is barred from.
  assertPatternsInJail(options.include, jailPath);

  const files = [...new Set(await resolveGlobs(options.include, jailPath, options.exclude ?? []))];

  await assertInJail(files, jailPath);

  if (files.length === 0) {
    throw new Error('No files were matched using the provided globs.');
  }

  files.sort();

  if (options.files) {
    return files.map((file) => relativePath(jailPath, file));
  }

  return await hashFiles(files, jailPath, options.content ?? false);
}
