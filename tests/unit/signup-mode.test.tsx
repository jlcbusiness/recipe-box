import { describe, expect, it, vi } from 'vitest';
import { signUp } from '../../src/app/actions/auth';
import { isSelfSignupAllowed } from '../../src/lib/auth/signup-mode';
import { createClient } from '../../src/lib/supabase/server';

vi.mock('../../src/lib/supabase/server', () => ({ createClient: vi.fn() }));

describe('self-signup mode', () => {
  it('allows self-signup only when the configured mode is open', () => {
    expect(isSelfSignupAllowed('open')).toBe(true);
    expect(isSelfSignupAllowed('invite_only')).toBe(false);
    expect(isSelfSignupAllowed(undefined, 'production')).toBe(false);
  });

  it('rejects a direct sign-up action in invite-only mode before contacting Auth', async () => {
    vi.stubEnv('SIGNUP_MODE', 'invite_only');
    const formData = new FormData();
    formData.set('email', 'person@example.test');
    formData.set('password', 'test-password-42');

    await expect(signUp(undefined, formData)).resolves.toEqual({
      error: 'Self sign-up is closed. Ask an admin for an invitation.',
    });
    expect(createClient).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
