import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RecipeMarkerActions } from '../../src/app/recipes/recipe-marker-actions';

describe('recipe marker actions', () => {
  it('suppresses hover after pointer activation until the pointer leaves', () => {
    render(
      <RecipeMarkerActions hearted={false} recipeId="recipe-id" starred={false} version={1} />,
    );
    const starButton = screen.getByRole('button', { name: 'Star recipe' });
    const starForm = starButton.closest('form');
    if (!starForm) throw new Error('Expected the Star action form.');

    fireEvent.pointerDown(starButton, { pointerId: 1, pointerType: 'mouse' });
    expect(starButton.classList.contains('is-hover-suppressed')).toBe(true);

    fireEvent.pointerLeave(starForm, { pointerId: 1, pointerType: 'mouse' });
    expect(starButton.classList.contains('is-hover-suppressed')).toBe(false);
  });
});
