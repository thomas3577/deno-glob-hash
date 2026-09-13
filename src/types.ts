/** Options for {@linkcode computeHash}. */
export interface IOptions {
  /** Glob patterns for files to include. At least one required. */
  include: string[];
  /** Glob patterns for files to exclude. */
  exclude?: string[];
  /**
   * Restrict file access to this directory.
   * Throws if any matched file resolves outside this path.
   * Defaults to the current working directory (`"."`).
   */
  jail?: string;
  /**
   * When `true`, returns the matched file paths (relative to `jail`)
   * instead of a hash.
   */
  files?: boolean;
  /**
   * When `true`, hashes the **content** of each file (accurate, but reads
   * every file from disk).
   * When `false` (default), hashes file **metadata** (`dev`, `ino`, `size`,
   * `mtime`) — much faster.
   *
   * Either way the file's path (relative to `jail`) is part of the hash, so a
   * rename changes the result.
   *
   * > **Note:** On Windows `dev` and `ino` are always `0`, so the metadata
   * > hash is effectively based on file path + `size` + `mtime`.
   */
  content?: boolean;
}
