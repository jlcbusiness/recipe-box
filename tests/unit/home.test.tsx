import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HomePageView } from '../../src/app/page';

afterEach(cleanup);

describe('home page', () => {
  it('offers email and password sign-in with a password-recovery link', () => {
    render(<HomePageView selfSignupAllowed={true} />);

    expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /email/i })).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined();
    const secondaryActions = screen.getByRole('link', { name: /forgot password/i }).parentElement;
    if (!secondaryActions) {
      throw new Error('The secondary action row is missing.');
    }
    expect(secondaryActions.classList.contains('auth-secondary-actions')).toBe(true);
    const signupLink = screen.getByRole('link', { name: /create an account/i });
    expect(signupLink.parentElement).toBe(secondaryActions);
    expect(
      screen.getByRole('button', { name: /sign in/i }).closest('.auth-secondary-actions'),
    ).toBeNull();
    expect(screen.getByRole('main')).toBeDefined();
  });

  it('hides self-sign-up when the mode is invite-only', () => {
    render(<HomePageView selfSignupAllowed={false} />);

    expect(screen.queryByRole('link', { name: /create an account/i })).toBeNull();
  });
});
