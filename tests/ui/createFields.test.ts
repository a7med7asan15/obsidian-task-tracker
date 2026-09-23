import { describe, expect, it } from 'vitest';
import { carryFields } from '../../src/ui/createFields';
import type { FieldDef } from '../../src/schema/types';

const status = (options: string[]): FieldDef => ({ key: 'status', label: 'Status', type: 'select', options, order: 0 });

describe('carryFields', () => {
  it('keeps a select value the new project offers', () => {
    expect(carryFields({ status: 'Done' }, [status(['To Do', 'Done'])])).toEqual({ status: 'Done' });
  });

  it("replaces a select value the new project doesn't offer with its default", () => {
    expect(carryFields({ status: 'To Do' }, [status(['Backlog', 'Doing'])])).toEqual({ status: 'Backlog' });
  });

  it('keeps only offered multiselect values; free text carries as is', () => {
    const schema: FieldDef[] = [
      { key: 'sprint', label: 'Sprint', type: 'multiselect', options: ['S2'], order: 0 },
      { key: 'note', label: 'Note', type: 'text', order: 1 },
    ];
    expect(carryFields({ sprint: ['S1', 'S2'], note: 'hi', gone: 1 }, schema)).toEqual({ sprint: ['S2'], note: 'hi' });
  });
});
