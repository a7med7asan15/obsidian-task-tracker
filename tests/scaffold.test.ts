import { describe, expect, it } from 'vitest';
import manifest from '../manifest.json';

describe('scaffold', () => {
  it('declares the expected plugin id and version floor', () => {
    expect(manifest.id).toBe('task-tracker');
    expect(manifest.minAppVersion).toBe('1.4.0');
  });
});
