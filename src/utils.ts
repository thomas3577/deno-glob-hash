import { expandGlob } from '@std/fs';
import { isAbsolute, relative, resolve, SEPARATOR } from '@std/path';

/**
 * Whether `target` lies outside `base`.
 *
 * On Windows `relative()` returns an absolute path across drive boundaries,
 * which never starts with '..', so both shapes have to be checked.
 */
const escapes = (base: string, target: string): boolean => {
  const rel = relative(base, target);
  return rel.startsWith('..') || isAbsolute(rel);
};

/**
 * Throws if a glob pattern points outside `jailPath`.
 *
 * Glob metacharacters only ever match *below* the point they appear, so
 * resolving the raw pattern against the jail and comparing prefixes is enough
 * to decide this without touching the filesystem. Doing it up front is the
 * point: an escaping pattern would otherwise walk the tree it is not allowed
 * to read before the per-file check ever runs.
 *
 * @param {string[]} globs - The glob patterns to check.
 * @param {string} jailPath - Absolute path to the jail root.
 *
 * @throws {Error} If any pattern resolves outside the jail.
 */
export const assertPatternsInJail = (globs: string[], jailPath: string): void => {
  for (const glob of globs) {
    if (escapes(jailPath, resolve(jailPath, glob))) {
      throw new Error(`Glob pattern points outside the permitted path: ${glob}`);
    }
  }
};

/**
 * Whether a symlink resolves to a regular file. A broken link counts as absent
 * rather than as an error, so one dangling link does not fail the whole run.
 */
const pointsToFile = async (path: string): Promise<boolean> => {
  try {
    return (await Deno.stat(path)).isFile;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false;
    }
    throw error;
  }
};

/**
 * Resolves an array of glob patterns to a list of absolute file paths.
 *
 * Relative patterns resolve against `root` rather than the working directory,
 * which keeps an ordinary pattern inside the jail instead of letting it walk
 * the filesystem before the jail check runs.
 *
 * Symlinks pointing at files are included; symlinked *directories* are never
 * traversed, because `walk()` does not track visited paths and a link cycle
 * would not terminate.
 *
 * @param {string[]} globs - An array of glob patterns to resolve.
 * @param {string} root - Absolute path that relative patterns resolve against.
 * @param {string[]} exclude - Glob patterns to skip while walking.
 *
 * @returns {Promise<string[]>} A promise that resolves to an array of absolute file paths.
 * @throws {Error} If any glob pattern is invalid or if file system access fails.
 */
export const resolveGlobs = async (globs: string[], root: string, exclude: string[]): Promise<string[]> => {
  const files: string[] = [];
  for (const glob of globs) {
    for await (const entry of expandGlob(glob, { globstar: true, root, exclude })) {
      if (entry.isFile || (entry.isSymlink && await pointsToFile(entry.path))) {
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
 * Throws if any file lies outside `jailPath`.
 *
 * Both sides are canonicalized first, so a symlink cannot point out of the jail
 * and a symlinked jail root does not produce false positives.
 *
 * @param {string[]} files - Absolute file paths to check.
 * @param {string} jailPath - Absolute path to the jail root.
 *
 * @throws {Error} If any file resolves outside the jail.
 */
export const assertInJail = async (files: string[], jailPath: string): Promise<void> => {
  const canonicalJailPath = await Deno.realPath(jailPath);

  for (const file of files) {
    if (escapes(canonicalJailPath, await Deno.realPath(file))) {
      throw new Error(`Attempt to read outside the permitted path: ${file}`);
    }
  }
};
