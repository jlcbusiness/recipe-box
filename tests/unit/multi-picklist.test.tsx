import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MultiPicklist } from '../../src/app/recipes/multi-picklist';

const values = [
  { id: 'salad', display_value: 'Salad' },
  { id: 'soup', display_value: 'Soup' },
  { id: 'roasting-pan', display_value: 'Roasting Pan' },
];

afterEach(cleanup);

type AddOptionHandler = (value: string) => Promise<{ valueId?: string; error?: string }>;

function MultiPicklistHarness({ onAddOption }: { onAddOption: AddOptionHandler }) {
  const [selectedIds, setSelectedIds] = useState(['salad']);
  const [isOpen, setIsOpen] = useState(true);

  return (
    <MultiPicklist
      category="equipment"
      isOpen={isOpen}
      label="Equipment"
      onAddOption={onAddOption}
      onClose={() => setIsOpen(false)}
      onSelectionChange={setSelectedIds}
      onToggle={() => setIsOpen(true)}
      selectedIds={selectedIds}
      values={values}
    />
  );
}

function renderMultiPicklist(
  onAddOption: AddOptionHandler = vi.fn().mockResolvedValue({ valueId: 'wok' }),
) {
  render(<MultiPicklistHarness onAddOption={onAddOption} />);
  return { onAddOption };
}

describe('multi-picklist search and addition', () => {
  it('filters options, offers explicit Add, and keeps multi-select toggle behavior', async () => {
    const onAddOption = vi.fn().mockResolvedValue({ valueId: 'wok' });
    renderMultiPicklist(onAddOption);

    const search = screen.getByRole('textbox', { name: 'Search Equipment' });
    fireEvent.change(search, { target: { value: 'soup' } });

    const soupOption = screen.getByRole('button', { name: 'Soup' });
    expect(soupOption.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Salad' })).toBeNull();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(soupOption);
    fireEvent.click(soupOption);
    expect(screen.getByRole('button', { name: 'Soup' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Salad' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Soup' })).toBeTruthy();

    fireEvent.change(search, { target: { value: 'New wok' } });
    fireEvent.click(screen.getByRole('button', { name: /Add.*New wok/u }));
    await waitFor(() => expect(onAddOption).toHaveBeenCalledWith('New wok'));
  });

  it('restores the full catalog after Escape and returns focus to the trigger', () => {
    renderMultiPicklist();

    const search = screen.getByRole('textbox', { name: 'Search Equipment' });
    const trigger = screen.getByRole('button', { name: 'Equipment: Salad' });
    fireEvent.change(search, { target: { value: 'soup' } });
    fireEvent.keyDown(search, { key: 'Escape' });

    expect(screen.queryByRole('group', { name: 'Equipment options' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Salad' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Soup' })).toBeTruthy();
  });

  it('suppresses Add when the query matches an existing value after normalization', () => {
    renderMultiPicklist();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search Equipment' }), {
      target: { value: '  roasting   pan  ' },
    });

    expect(screen.getByRole('button', { name: 'Roasting Pan' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add.*roasting.*pan/iu })).toBeNull();
  });

  it('shows an accessible error and keeps selections unchanged when adding fails', async () => {
    const onAddOption = vi.fn().mockResolvedValue({ error: 'Could not add this value.' });
    renderMultiPicklist(onAddOption);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search Equipment' }), {
      target: { value: 'New wok' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add.*New wok/u }));

    expect((await screen.findByRole('alert')).textContent).toContain('Could not add this value.');
    expect(screen.getByRole('button', { name: 'Equipment: Salad' })).toBeTruthy();
    expect(onAddOption).toHaveBeenCalledWith('New wok');
  });
});
