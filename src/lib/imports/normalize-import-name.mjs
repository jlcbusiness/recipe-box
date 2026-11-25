export function normalizeImportName(value) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}
