import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecipeMadeAction } from '../../src/app/recipes/recipe-made-action';
import { isSameLocalCalendarDay, nextLocalDayBoundary } from '../../src/lib/recipes/made-rules';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Made date rules', () => {
  it('treats the DST jump as one local day and finds the next midnight', () => {
    expect(
      isSameLocalCalendarDay(
        '2026-03-08T09:59:59.000Z',
        '2026-03-08T10:00:00.000Z',
        'America/Los_Angeles',
      ),
    ).toBe(true);
    expect(
      nextLocalDayBoundary(
        new Date('2026-03-08T09:59:59.000Z'),
        'America/Los_Angeles',
      ).toISOString(),
    ).toBe('2026-03-09T07:00:00.000Z');
  });
});

describe('recipe Made action', () => {
  it('shows the full count and disables the outlined control after today’s mark', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T12:00:00.000Z'));

    render(
      <RecipeMadeAction
        lastMadeAt="2026-03-08T11:00:00.000Z"
        madeCount={123}
        recipeId="recipe-id"
        reason={null}
        state="tried"
        version={1}
      />,
    );

    const button = screen.getByRole('button', { name: /already recorded today/i });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('123')).not.toBeNull();
    expect(button.querySelector('.recipe-made-pot-closed-lid')).not.toBeNull();
    expect(screen.getByText(/Last made:/)).not.toBeNull();
    expect(button.getAttribute('data-marked-today')).toBe('true');
  });

  it('returns to an enabled outline at the next local day boundary without a reload', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T12:00:00.000Z'));
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    render(
      <RecipeMadeAction
        lastMadeAt={new Date().toISOString()}
        madeCount={4}
        recipeId="recipe-id"
        reason={null}
        state="tried"
        version={1}
      />,
    );

    const button = screen.getByRole('button', { name: /already recorded today/i });
    expect(button.hasAttribute('disabled')).toBe(true);
    const boundary = nextLocalDayBoundary(new Date(), timezone);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(boundary.getTime() - Date.now() + 100);
    });

    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('data-marked-today')).toBe('false');
  });

  it('masks preserved values and exposes the Will not try reason accessibly', () => {
    render(
      <RecipeMadeAction
        lastMadeAt="2026-03-08T11:00:00.000Z"
        madeCount={123}
        recipeId="recipe-id"
        reason="Too spicy"
        state="will_not_try"
        version={1}
      />,
    );

    const button = screen.getByRole('button', { name: /Will not try.*Too spicy/i });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(screen.queryByText('123')).toBeNull();
    expect(screen.queryByText(/Last made:/)).toBeNull();
    expect(screen.getByText('✘')).not.toBeNull();
  });

  it('shows Want to try as zero and ignores its preserved timestamp for today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T12:00:00.000Z'));

    render(
      <RecipeMadeAction
        lastMadeAt="2026-03-08T11:00:00.000Z"
        madeCount={123}
        recipeId="recipe-id"
        reason={null}
        state="want_to_try"
        version={1}
      />,
    );

    const button = screen.getByRole('button', { name: /Record Made\. Made 0 times\./i });
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(screen.getByText('0')).not.toBeNull();
    expect(screen.queryByText(/Last made:/)).toBeNull();
    expect(button.getAttribute('data-marked-today')).toBe('false');
  });

  it('identifies an unknown legacy date without implying the recipe was never made', () => {
    render(
      <RecipeMadeAction
        lastMadeAt={null}
        madeCount={3}
        recipeId="recipe-id"
        reason={null}
        state="tried"
        version={1}
      />,
    );

    expect(screen.getByText('Last made date unknown.')).not.toBeNull();
    const button = screen.getByRole('button', { name: /Record Made/i });
    expect(button.querySelector('.recipe-made-pot-closed-lid')).toBeNull();
  });
});
