export function isSelfSignupAllowed(
  mode: string | undefined = process.env.SIGNUP_MODE,
  nodeEnvironment: string | undefined = process.env.NODE_ENV,
): boolean {
  if (mode === 'open') {
    return true;
  }

  if (mode === 'invite_only') {
    return false;
  }

  return nodeEnvironment !== 'production';
}
