import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Picklist, type PicklistOption } from '../../src/app/picklist';

const options: PicklistOption[] = [
  { value: 'salad', label: 'Salad' },
  { value: 'salsa', label: 'Salsa' },
  { value: 'soup', label: 'Soup' },
  { value: 'starter', label: 'Starter' },
];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderPicklist(value = 'starter', picklistOptions = options) {
  const onSelect = vi.fn();
  render(
    <Picklist
      className="test-picklist"
      label="Food Type"
      onSelect={onSelect}
      options={picklistOptions}
      value={value}
    />,
  );
  const trigger = screen.getByRole('combobox', { name: 'Food Type' });

  return { onSelect, trigger };
}

function getActiveOption(trigger: HTMLElement) {
  const activeId = trigger.getAttribute('aria-activedescendant');
  return activeId ? document.getElementById(activeId)?.textContent : null;
}

describe('shared picklist portal target', () => {
  it('prefers the nearest dialog over a containing main landmark', () => {
    const onSelect = vi.fn();
    render(
      <main>
        <dialog open>
          <Picklist
            className="test-picklist"
            label="Food Type"
            onSelect={onSelect}
            options={options}
            value="starter"
          />
        </dialog>
      </main>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Food Type' }));

    const listbox = screen.getByRole('listbox');
    expect(listbox.parentElement).toBe(screen.getByRole('dialog'));
  });

  it('portals to the nearest main landmark when no dialog contains the trigger', () => {
    const onSelect = vi.fn();
    render(
      <main>
        <Picklist
          className="test-picklist"
          label="Food Type"
          onSelect={onSelect}
          options={options}
          value="starter"
        />
      </main>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Food Type' }));

    expect(screen.getByRole('listbox').parentElement).toBe(screen.getByRole('main'));
  });

  it('falls back to body when no dialog or main landmark contains the trigger', () => {
    const { trigger } = renderPicklist();
    fireEvent.click(trigger);

    expect(screen.getByRole('listbox').parentElement).toBe(document.body);
  });
});

describe('shared picklist type-ahead', () => {
  it('refines a short prefix without selecting the active option', () => {
    const { onSelect, trigger } = renderPicklist();
    fireEvent.click(trigger);

    fireEvent.keyDown(trigger, { key: 's' });
    expect(getActiveOption(trigger)).toContain('Salad');
    fireEvent.keyDown(trigger, { key: 'o' });

    expect(getActiveOption(trigger)).toContain('Soup');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('cycles duplicate initials and wraps through matching options', () => {
    const { onSelect, trigger } = renderPicklist();
    fireEvent.click(trigger);

    fireEvent.keyDown(trigger, { key: 's' });
    expect(getActiveOption(trigger)).toContain('Salad');
    fireEvent.keyDown(trigger, { key: 's' });
    expect(getActiveOption(trigger)).toContain('Salsa');
    fireEvent.keyDown(trigger, { key: 's' });
    expect(getActiveOption(trigger)).toContain('Soup');
    fireEvent.keyDown(trigger, { key: 's' });
    expect(getActiveOption(trigger)).toContain('Starter');
    fireEvent.keyDown(trigger, { key: 's' });
    expect(getActiveOption(trigger)).toContain('Salad');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('starts a new query after the buffer expires and leaves the active option on no match', () => {
    vi.useFakeTimers();
    const picklistOptions = [...options, { value: 'olive', label: 'Olive' }];
    const { trigger } = renderPicklist('starter', picklistOptions);
    fireEvent.click(trigger);

    fireEvent.keyDown(trigger, { key: 's' });
    expect(getActiveOption(trigger)).toContain('Salad');
    vi.advanceTimersByTime(701);
    fireEvent.keyDown(trigger, { key: 'o' });
    expect(getActiveOption(trigger)).toContain('Olive');

    fireEvent.keyDown(trigger, { key: 'x' });
    expect(getActiveOption(trigger)).toContain('Olive');
  });

  it('preserves arrow navigation, Escape focus return, and explicit Enter selection', () => {
    const { onSelect, trigger } = renderPicklist();
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'Escape' });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(getActiveOption(trigger)).toContain('Salad');
    fireEvent.keyDown(trigger, { key: 'Home' });
    expect(getActiveOption(trigger)).toContain('Salad');
    fireEvent.keyDown(trigger, { key: 'End' });
    expect(getActiveOption(trigger)).toContain('Starter');
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(getActiveOption(trigger)).toContain('Soup');
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('soup');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps Space as the existing active-option selection key', () => {
    const { onSelect, trigger } = renderPicklist();
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: ' ' });

    expect(onSelect).toHaveBeenCalledWith('starter');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
