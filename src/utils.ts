import { expandGlob } from '@std/fs';
import { isAbsolute, relative, resolve } from '@std/path';

/**
 * Resolves an array of glob patterns to a deduplicated list of absolute
 * file paths.
 *
 * @param {string[]} globs - An array of glob patterns to resolve.
 *
 * @returns {Promise<string[]>} A promise that resolves to an array of absolute file paths.
 * @throws {Error} If any glob pattern is invalid or if file system access fails.
 */
export const resolveGlobs = async (globs: string[]): Promise<string[]> => {
  const files: string[] = [];
  for (const g of globs) {
    for await (const entry of expandGlob(g, { globstar: true })) {
      if (entry.isFile) {
        files.push(resolve(entry.path));
      }
    }
  }
  return files;
};

/**
 * Computes a SHA-256 hash over an array of files.
 *
 * In metadata mode (`useContent = false`), hashes `path + dev + ino + size + mtime`
 * per file (fast). In content mode (`useContent = true`), reads and hashes
 * full file bytes (accurate).
 *
 * To keep memory bounded for large file sets, this computes a per-file
 * digest and folds it into a fixed-size rolling digest.
 *
 * @param {string[]} files - Absolute file paths to hash.
 * @param {boolean} useContent - Whether to hash file content (true) or metadata (false).
 *
 * @returns {string} A 64-character lowercase hex string.
 */
export const hashFiles = async (files: string[], useContent: boolean): Promise<string> => {
  const encoder = new TextEncoder();
  let rolling = new Uint8Array(32);

  for (const file of files) {
    let fileDigestBytes: Uint8Array;

    if (useContent) {
      const content = await Deno.readFile(file);
      fileDigestBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', content));
    } else {
      const stat = await Deno.stat(file);
      const meta = `${file}-${stat.dev ?? 0}-${stat.ino ?? 0}-${stat.size}-${stat.mtime?.getTime() ?? 0}`;
      fileDigestBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(meta)));
    }

    // Keep memory bounded by folding each file hash into a fixed-size rolling digest.
    const combined = new Uint8Array(rolling.length + fileDigestBytes.length);
    combined.set(rolling, 0);
    combined.set(fileDigestBytes, rolling.length);
    rolling = new Uint8Array(await crypto.subtle.digest('SHA-256', combined));
  }

  return Array.from(rolling)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Checks that every file path lies within `jailPath`.
 * Returns an `Error` for the first violation, or `undefined` if all paths
 * are safe.
 *
 * @param {string[]} files - Absolute file paths to check.
 * @param {string} jailPath - Absolute path to the jail root. If falsy, no check is performed.
 *
 * @returns {Error | undefined} An `Error` if any file is outside the jail, or `undefined` if all are safe.
 */
export const jail = async (files: string[], jailPath: string): Promise<Error | undefined> => {
  if (!jailPath) {
    return;
  }

  const canonicalJailPath = await Deno.realPath(jailPath);

  for (const file of files) {
    const canonicalFilePath = await Deno.realPath(file);
    const rel = relative(canonicalJailPath, canonicalFilePath);
    const outsideJail = rel.startsWith('..') || isAbsolute(rel);

    if (outsideJail) {
      return new Error('Attempt to read outside the permitted path.');
    }
  }
};
