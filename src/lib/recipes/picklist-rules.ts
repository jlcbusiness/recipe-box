export function normalizePicklistMatchText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}
