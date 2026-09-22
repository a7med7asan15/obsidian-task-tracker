/**
 * The narrow slice of vault behaviour the writer needs. Implemented over
 * Obsidian in Task 10 and over a Map in tests.
 */
export interface VaultAdapter {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  create(path: string, content: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Vault-relative paths directly inside `folder`. */
  list(folder: string): Promise<string[]>;
  /**
   * Mutate the file's frontmatter as a parsed object rather than through
   * line-based string surgery, so a YAML shape already in the file (a
   * block sequence, a quoted scalar, ...) round-trips instead of getting
   * corrupted. Creates a frontmatter block, preserving 100% of the existing
   * body, when the file doesn't have one yet.
   */
  processFrontmatter(path: string, mutate: (fm: Record<string, unknown>) => void): Promise<void>;
}
