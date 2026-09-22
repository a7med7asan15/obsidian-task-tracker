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
}
