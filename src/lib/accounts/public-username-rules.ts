const publicUsernamePattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/u;

export function normalizePublicUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validatePublicUsername(value: string): string | null {
  const username = normalizePublicUsername(value);
  if (username.length < 3 || username.length > 30 || !publicUsernamePattern.test(username)) {
    return 'Use 3–30 letters, numbers, or hyphens, with no hyphen at either end.';
  }
  return null;
}
