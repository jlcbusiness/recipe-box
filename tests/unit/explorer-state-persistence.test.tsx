import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { saveExplorerState } = vi.hoisted(() => ({
  saveExplorerState: vi.fn(),
}));

vi.mock('../../src/app/actions/explorer-state', () => ({ saveExplorerState }));

import { ExplorerStatePersistence } from '../../src/app/explorer-state-persistence';
import type { ExplorerState } from '../../src/lib/explorer-state';

const listState = {
  schema_version: 1 as const,
  filters: [],
  sort: 'name',
  direction: 'asc' as const,
  view: 'list' as const,
};

describe('ExplorerStatePersistence', () => {
  afterEach(cleanup);

  beforeEach(() => {
    saveExplorerState.mockReset();
  });

  it('keeps the initial view usable and reports a later save failure', async () => {
    saveExplorerState.mockResolvedValue({ error: 'Explorer preference could not be saved.' });
    const view = render(<ExplorerStatePersistence context="recipes-find" state={listState} />);

    expect(saveExplorerState).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();

    view.rerender(
      <ExplorerStatePersistence context="recipes-find" state={{ ...listState, view: 'grid' }} />,
    );

    await waitFor(() => {
      expect(saveExplorerState).toHaveBeenCalledWith('recipes-find', {
        ...listState,
        view: 'grid',
      });
    });
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Explorer preference could not be saved.',
    );
  });

  it('saves URL state without overwriting display preferences', async () => {
    saveExplorerState.mockResolvedValue({});
    const state: ExplorerState = {
      schema_version: 2,
      display_preferences: {
        visible_columns: ['publication'],
        column_widths: { name: 320 },
      },
      filters: [],
      sort: 'name',
      direction: 'asc',
      view: 'list',
    };
    const view = render(<ExplorerStatePersistence context="recipes-find" state={state} />);

    view.rerender(
      <ExplorerStatePersistence context="recipes-find" state={{ ...state, sort: 'updated_at' }} />,
    );

    await waitFor(() => {
      expect(saveExplorerState).toHaveBeenCalledWith('recipes-find', {
        schema_version: 1,
        filters: [],
        sort: 'updated_at',
        direction: 'asc',
        view: 'list',
      });
    });
  });
});
