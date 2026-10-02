import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from '../../src/app/page';

describe('home page', () => {
  it('shows the Recipe Box heading and local empty-workspace state', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Recipe Box' })).toBeDefined();
    expect(screen.getByText('Your local recipe workspace is ready.')).toBeDefined();
    expect(screen.getByRole('main')).toBeDefined();
  });
});
