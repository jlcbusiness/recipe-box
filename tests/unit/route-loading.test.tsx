import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RouteLoading } from '../../src/app/route-loading';

describe('RouteLoading', () => {
  afterEach(cleanup);

  it('announces loading in a busy main landmark', () => {
    render(<RouteLoading />);

    const main = screen.getByRole('main');
    const status = screen.getByRole('status');
    expect(main.getAttribute('aria-busy')).toBe('true');
    expect(status.parentElement).toBe(main);
    expect(status.textContent).toBe('Loading…');
  });
});
