import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveExplorerState } = vi.hoisted(() => ({
  saveExplorerState: vi.fn(),
}));

vi.mock('../../src/app/actions/explorer-state', () => ({ saveExplorerState }));

import { ExplorerStatePersistence } from '../../src/app/explorer-state-persistence';

const listState = {
  schema_version: 1 as const,
  filters: [],
  sort: 'name',
  direction: 'asc' as const,
  view: 'list' as const,
};

describe('ExplorerStatePersistence', () => {
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
});
