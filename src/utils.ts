import { expandGlob } from "@std/fs";
import { relative, resolve } from "@std/path";

/**
 * Resolves an array of glob patterns to a deduplicated list of absolute
 * file paths.
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
 * In metadata mode (`useContent = false`), hashes `dev + ino + size + mtime`
 * per file (fast). In content mode (`useContent = true`), reads and hashes
 * the full byte content of every file (accurate).
 *
 * Returns a 64-character lowercase hex string.
 */
export const hashFiles = async (
  files: string[],
  useContent: boolean,
): Promise<string> => {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  for (const file of files) {
    if (useContent) {
      parts.push(await Deno.readFile(file));
    } else {
      const stat = await Deno.stat(file);
      const meta = `${stat.dev ?? 0}-${stat.ino ?? 0}-${stat.size}-${
        stat.mtime?.getTime() ?? 0
      }`;
      parts.push(encoder.encode(meta));
    }
  }

  // Concatenate all parts into a single buffer for a single digest call.
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

/**
 * Checks that every file path lies within `jailPath`.
 * Returns an `Error` for the first violation, or `undefined` if all paths
 * are safe.
 */
export const jail = (
  files: string[],
  jailPath: string,
): Error | undefined => {
  if (!jailPath) return;
  for (const file of files) {
    if (relative(jailPath, file).startsWith("..")) {
      return new Error("Attempt to read outside the permitted path.");
    }
  }
};
