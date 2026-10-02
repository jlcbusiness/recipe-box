import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from '../../src/app/page';

describe('home page', () => {
  it('offers email and password sign-in with a password-recovery link', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1, name: /sign in/i })).toBeDefined();
    expect(screen.getByRole('textbox', { name: /email/i })).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined();
    expect(screen.getByRole('link', { name: /forgot password/i })).toBeDefined();
    expect(screen.getByRole('main')).toBeDefined();
  });
});
