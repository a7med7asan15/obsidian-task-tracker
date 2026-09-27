import { describe, expect, it } from 'vitest';
import { shouldSaveDescription } from '../../src/ui/descriptionDraft';

describe('shouldSaveDescription', () => {
  it('never saves over a frontmatter-only stub, even an empty draft', () => {
    // The blanking bug: the pane opened on the stub, kept its '' draft after the
    // body loaded, and a blur wrote '' over the real description.
    expect(shouldSaveDescription({ bodyLoaded: false, description: '' }, '')).toBe(false);
    expect(shouldSaveDescription({ bodyLoaded: false, description: '' }, 'typed')).toBe(false);
  });

  it('saves a changed draft once the body is loaded', () => {
    expect(shouldSaveDescription({ bodyLoaded: true, description: 'old' }, 'new')).toBe(true);
    expect(shouldSaveDescription({ bodyLoaded: true, description: 'old' }, '')).toBe(true);
  });

  it('skips an unchanged draft', () => {
    expect(shouldSaveDescription({ bodyLoaded: true, description: 'same' }, 'same')).toBe(false);
  });
});
