import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { routerRefresh, saveExplorerState } = vi.hoisted(() => ({
  routerRefresh: vi.fn(),
  saveExplorerState: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: routerRefresh }) }));
vi.mock('../../src/app/actions/explorer-state', () => ({ saveExplorerState }));

import {
  ExplorerColumnResizeHandle,
  ExplorerListPreferences,
} from '../../src/app/explorer-list-preferences';
import type {
  ExplorerColumnDefinition,
  ExplorerState,
  ExplorerStateContext,
} from '../../src/lib/explorer-state';

const state: ExplorerState = {
  schema_version: 1,
  filters: [],
  sort: 'name',
  direction: 'asc',
  view: 'list',
};

function renderPreferences({
  initialPreferences,
  context = 'recipes-find',
  columnDefinitions,
}: {
  initialPreferences?: { visible_columns: string[]; column_widths: Record<string, number> };
  context?: ExplorerStateContext;
  columnDefinitions?: ExplorerColumnDefinition[];
} = {}) {
  return render(
    <ExplorerListPreferences
      context={context}
      columnDefinitions={columnDefinitions}
      initialPreferences={initialPreferences}
      state={state}
    >
      <button type="button">Outside the chooser</button>
      <table>
        <thead>
          <tr>
            <th data-explorer-column="name">
              <ExplorerColumnResizeHandle column="name" />
            </th>
            <th data-explorer-column="publication">
              <ExplorerColumnResizeHandle column="publication" />
            </th>
            <th data-explorer-column="state">
              <ExplorerColumnResizeHandle column="state" />
            </th>
          </tr>
        </thead>
      </table>
    </ExplorerListPreferences>,
  );
}

describe('ExplorerListPreferences', () => {
  afterEach(cleanup);

  beforeEach(() => {
    saveExplorerState.mockReset().mockResolvedValue({});
  });

  it('shows context defaults, keeps Name required, and immediately saves visibility changes', async () => {
    const view = renderPreferences();
    const root = view.container.querySelector('.explorer-list-preferences');
    expect(root?.getAttribute('data-visible-columns')).toBe(
      'name publication state visibility total_time_minutes',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose List columns' }));
    expect(screen.getByText('Always shown')).toBeTruthy();
    expect(
      (screen.getByRole('checkbox', { name: 'Publication' }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Publication' }));

    expect(root?.getAttribute('data-visible-columns')).toBe(
      'name state visibility total_time_minutes',
    );
    await waitFor(() => {
      expect(saveExplorerState).toHaveBeenCalledWith('recipes-find', {
        ...state,
        schema_version: 2,
        display_preferences: {
          visible_columns: ['state', 'visibility', 'total_time_minutes'],
          column_widths: {},
        },
      });
    });
  });

  it('keeps visibility usable after a failed save and clears the error on retry', async () => {
    saveExplorerState
      .mockResolvedValueOnce({ error: 'Explorer preference could not be saved.' })
      .mockResolvedValueOnce({});
    const view = renderPreferences();
    const root = view.container.querySelector('.explorer-list-preferences');

    fireEvent.click(screen.getByRole('button', { name: 'Choose List columns' }));
    const publication = screen.getByRole('checkbox', { name: 'Publication' });
    fireEvent.click(publication);

    expect(root?.getAttribute('data-visible-columns')).toBe(
      'name state visibility total_time_minutes',
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Explorer preference could not be saved.',
    );

    fireEvent.click(publication);

    expect(root?.getAttribute('data-visible-columns')).toBe(
      'name publication state visibility total_time_minutes',
    );
    await waitFor(() => {
      expect(saveExplorerState).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('uses Library defaults while keeping optional columns hidden', () => {
    const view = renderPreferences({ context: 'publications' });
    const root = view.container.querySelector('.explorer-list-preferences');
    expect(root?.getAttribute('data-visible-columns')).toBe('name author edition recipe_count');

    fireEvent.click(screen.getByRole('button', { name: 'Choose List columns' }));
    expect((screen.getByRole('checkbox', { name: 'Tags' }) as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it('restores context defaults and clears custom widths on reset', async () => {
    const view = renderPreferences({
      initialPreferences: { visible_columns: [], column_widths: { name: 320 } },
    });
    const root = view.container.querySelector<HTMLElement>('.explorer-list-preferences');
    expect(root?.getAttribute('data-visible-columns')).toBe('name');
    expect(root?.style.getPropertyValue('--explorer-column-width-name')).toBe('320px');

    fireEvent.click(screen.getByRole('button', { name: 'Choose List columns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset columns' }));

    expect(root?.getAttribute('data-visible-columns')).toBe(
      'name publication state visibility total_time_minutes',
    );
    expect(root?.style.getPropertyValue('--explorer-column-width-name')).toBe('');
    await waitFor(() => {
      expect(saveExplorerState).toHaveBeenCalledWith('recipes-find', {
        ...state,
        schema_version: 2,
        display_preferences: {
          visible_columns: ['publication', 'state', 'visibility', 'total_time_minutes'],
          column_widths: {},
        },
      });
    });
  });

  it('caps saved Find column widths to keep non-Name columns compact', () => {
    const view = renderPreferences({
      initialPreferences: {
        visible_columns: ['publication', 'state', 'total_time_minutes'],
        column_widths: {
          name: 900,
          publication: 500,
          state: 440,
          total_time_minutes: 440,
        },
      },
    });
    const root = view.container.querySelector<HTMLElement>('.explorer-list-preferences');

    expect(root?.style.getPropertyValue('--explorer-list-grid-template-columns')).toBe(
      '720px 320px 180px 160px',
    );
  });

  it('caps saved publication column widths and applies compact automatic tracks', () => {
    const view = renderPreferences({
      context: 'publications',
      initialPreferences: {
        visible_columns: ['author', 'edition', 'recipe_count'],
        column_widths: {
          name: 900,
          author: 500,
          edition: 500,
          recipe_count: 500,
        },
      },
    });
    const root = view.container.querySelector<HTMLElement>('.explorer-list-preferences');

    expect(root?.style.getPropertyValue('--explorer-list-grid-template-columns')).toBe(
      '720px 320px 320px 120px',
    );
    expect(root?.style.getPropertyValue('--explorer-column-width-author')).toBe('320px');
  });

  it('applies compact width caps to publication recipe columns', () => {
    const view = renderPreferences({
      context: 'publication-recipes:cf1130fe-6225-4fd7-b6fc-3711ae656315',
      initialPreferences: {
        visible_columns: ['state', 'total_time_minutes'],
        column_widths: { name: 900, state: 440, total_time_minutes: 440 },
      },
    });
    const root = view.container.querySelector<HTMLElement>('.explorer-list-preferences');

    expect(root?.style.getPropertyValue('--explorer-list-grid-template-columns')).toBe(
      '720px 180px 160px',
    );
  });

  it.each([
    { context: 'recipes-find', name: 'Find' },
    {
      context: 'publication-recipes:cf1130fe-6225-4fd7-b6fc-3711ae656315',
      name: 'Publication recipes',
    },
  ] as const)('resets $name from the shared recipe column settings', async ({ context }) => {
    const columnDefinitions: ExplorerColumnDefinition[] = [
      { key: 'state', label: 'State', defaultVisible: true, minWidth: 96, maxWidth: 600 },
      {
        key: 'name',
        label: 'Name',
        defaultVisible: true,
        required: true,
        minWidth: 180,
        maxWidth: 720,
      },
      {
        key: 'publication',
        label: 'Publication',
        defaultVisible: false,
        minWidth: 96,
        maxWidth: 600,
      },
    ];
    const view = renderPreferences({
      context,
      columnDefinitions,
      initialPreferences: { visible_columns: ['publication'], column_widths: {} },
    });
    const root = view.container.querySelector('.explorer-list-preferences');
    fireEvent.click(screen.getByRole('button', { name: 'Choose List columns' }));
    const chooser = screen.getByRole('group', { name: 'List columns' });
    const nameCheckbox = screen.getByRole('checkbox', { name: /Name/ }) as HTMLInputElement;

    expect(chooser.children.item(1)?.className).toBe('explorer-list-preferences-reset');
    expect(nameCheckbox.checked).toBe(true);
    expect(nameCheckbox.disabled).toBe(true);
    expect(root?.getAttribute('data-visible-columns')).toBe('name publication');

    fireEvent.click(screen.getByRole('button', { name: 'Reset columns' }));

    expect(root?.getAttribute('data-visible-columns')).toBe('state name');
    expect(
      (screen.getByRole('checkbox', { name: 'Publication' }) as HTMLInputElement).checked,
    ).toBe(false);
    await waitFor(() => {
      expect(saveExplorerState).toHaveBeenCalledWith(context, {
        ...state,
        schema_version: 2,
        display_preferences: { visible_columns: ['state'], column_widths: {} },
      });
    });
  });

  it('closes the chooser after a pointer interaction outside the chooser', () => {
    renderPreferences();
    fireEvent.click(screen.getByRole('button', { name: 'Choose List columns' }));
    expect(screen.getByRole('group', { name: 'List columns' })).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside the chooser' }));
    expect(screen.queryByRole('group', { name: 'List columns' })).toBeNull();
  });

  it('closes the chooser on Escape and returns focus to its trigger', () => {
    renderPreferences();
    const trigger = screen.getByRole('button', { name: 'Choose List columns' });
    fireEvent.click(trigger);
    expect(screen.getByRole('group', { name: 'List columns' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('group', { name: 'List columns' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('updates width while dragging, persists on release, and restores on pointer cancellation', async () => {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });
    const view = renderPreferences({
      initialPreferences: { visible_columns: ['publication'], column_widths: { name: 260 } },
    });
    const root = view.container.querySelector<HTMLElement>('.explorer-list-preferences');
    const handle = view.container.querySelector<HTMLElement>(
      '[data-explorer-resize-column="name"]',
    );

    if (!root || !handle) throw new Error('Expected the List column resize handle.');
    fireEvent.pointerDown(handle, { pointerId: 7, clientX: 100, pointerType: 'mouse' });
    fireEvent.pointerMove(root, { pointerId: 7, clientX: 160, pointerType: 'mouse' });
    expect(root.style.getPropertyValue('--explorer-column-width-name')).toBe('320px');
    fireEvent.pointerCancel(root, { pointerId: 7, pointerType: 'mouse' });
    expect(root.style.getPropertyValue('--explorer-column-width-name')).toBe('260px');
    expect(saveExplorerState).not.toHaveBeenCalled();

    fireEvent.pointerDown(handle, { pointerId: 8, clientX: 100, pointerType: 'mouse' });
    fireEvent.pointerMove(root, { pointerId: 8, clientX: 160, pointerType: 'mouse' });
    fireEvent.pointerUp(root, { pointerId: 8, clientX: 160, pointerType: 'mouse' });
    await waitFor(() => {
      expect(saveExplorerState).toHaveBeenCalledWith('recipes-find', {
        ...state,
        schema_version: 2,
        display_preferences: {
          visible_columns: ['publication'],
          column_widths: { name: 320 },
        },
      });
    });
  });
});
