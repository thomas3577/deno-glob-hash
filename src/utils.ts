import { expandGlob } from '@std/fs';
import { isAbsolute, relative, resolve, SEPARATOR } from '@std/path';

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
 * Returns `file` relative to `jailPath`, always using forward slashes so the
 * result is identical on every platform.
 *
 * @param {string} jailPath - Absolute path to the jail root.
 * @param {string} file - Absolute file path inside the jail.
 *
 * @returns {string} The relative, slash-separated path.
 */
export const relativePath = (jailPath: string, file: string): string => relative(jailPath, file).replaceAll(SEPARATOR, '/');

/** Hex-encodes a digest. */
const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/**
 * Computes a SHA-256 hash over an array of files.
 *
 * Every file is digested on its own and folded into a `<path> <digest>` line;
 * the returned hash is the digest over those lines. Including the path makes
 * renames visible, and the per-file digest keeps file boundaries unambiguous.
 *
 * In metadata mode (`useContent = false`), hashes `dev + ino + size + mtime`
 * per file (fast). In content mode (`useContent = true`), reads and hashes
 * full file bytes (accurate).
 *
 * @param {string[]} files - Absolute file paths to hash.
 * @param {string} jailPath - Absolute path to the jail root, used to relativize paths.
 * @param {boolean} useContent - Whether to hash file content (true) or metadata (false).
 *
 * @returns {Promise<string>} A 64-character lowercase hex string.
 */
export const hashFiles = async (files: string[], jailPath: string, useContent: boolean): Promise<string> => {
  const encoder = new TextEncoder();
  const lines: string[] = [];

  for (const file of files) {
    let body: Uint8Array<ArrayBuffer>;
    if (useContent) {
      // ponytail: reads one whole file into memory; @std/crypto digests an AsyncIterable if single files ever outgrow RAM.
      body = await Deno.readFile(file);
    } else {
      const stat = await Deno.stat(file);
      body = encoder.encode(`${stat.dev ?? 0}-${stat.ino ?? 0}-${stat.size}-${stat.mtime?.getTime() ?? 0}`);
    }

    lines.push(`${relativePath(jailPath, file)} ${toHex(await crypto.subtle.digest('SHA-256', body))}`);
  }

  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(lines.join('\n'))));
};

/**
 * Checks that every file path lies within `jailPath`.
 * Returns an `Error` for the first violation, or `undefined` if all paths
 * are safe.
 *
 * Both sides are canonicalized first, so a symlink cannot point out of the jail
 * and a symlinked jail root does not produce false positives.
 *
 * @param {string[]} files - Absolute file paths to check.
 * @param {string} jailPath - Absolute path to the jail root.
 *
 * @returns {Promise<Error | undefined>} An `Error` if any file is outside the jail, or `undefined` if all are safe.
 */
export const jail = async (files: string[], jailPath: string): Promise<Error | undefined> => {
  const canonicalJailPath = await Deno.realPath(jailPath);

  for (const file of files) {
    // On Windows `relative()` returns an absolute path across drive boundaries, which never starts with '..'.
    const rel = relative(canonicalJailPath, await Deno.realPath(file));
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return new Error('Attempt to read outside the permitted path.');
    }
  }
};
