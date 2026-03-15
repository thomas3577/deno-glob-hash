import { resolve } from '@std/path';
import { hashFiles, jail, resolveGlobs } from './utils.ts';
import type { IOptions } from './types.ts';

export type { IOptions } from './types.ts';

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
export const computeHash = async (options: IOptions): Promise<string | string[]> => {
  const jailPath = resolve(options.jail ?? '.');

  const includes = await resolveGlobs(options.include);
  const excludes = new Set(await resolveGlobs(options.exclude ?? []));

  // Deduplicate and apply excludes.
  const files = [...new Set(includes.filter((f) => !excludes.has(f)))];

  const jailError = jail(files, jailPath);
  if (jailError) {
    throw jailError;
  }

  if (files.length === 0) {
    throw new Error('No files were matched using the provided globs.');
  }

  files.sort();

  if (options.files) {
    // Return paths relative to the jail root.
    const prefix = jailPath.endsWith('/') || jailPath.endsWith('\\')
      ? jailPath.length
      : jailPath.length + 1;

    return files.map((file) => file.substring(prefix));
  }

  return await hashFiles(files, options.content ?? false);
};
