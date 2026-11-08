export type AdminUpdateKind = 'fix' | 'feature';

export type AdminUpdate = {
  id: string;
  body_markdown: string;
  kind: AdminUpdateKind;
  completed_version: string | null;
  is_archived: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
};

const SEMVER_CORE_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?![\s\S])/u;

export function isAdminUpdateKind(value: unknown): value is AdminUpdateKind {
  return value === 'fix' || value === 'feature';
}

export function normalizeAdminUpdateBody(value: string): string {
  return value.trim();
}

export function getAdminUpdateBodyError(value: string): string | null {
  const body = normalizeAdminUpdateBody(value);
  if (!body) {
    return 'Enter update text.';
  }
  if (Array.from(body).length > 5_000) {
    return 'Update text must be 5,000 characters or fewer.';
  }
  return null;
}

function parseSemverCore(value: string): readonly [string, string, string] {
  const match = SEMVER_CORE_PATTERN.exec(value);
  if (!match || match[0] !== value) {
    throw new Error('Expected a semantic version core.');
  }
  return [match[1], match[2], match[3]];
}

export function isSemverCore(value: string): boolean {
  return SEMVER_CORE_PATTERN.test(value);
}

function compareNumericParts(left: string, right: string): number {
  if (left.length !== right.length) {
    return left.length < right.length ? -1 : 1;
  }
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function compareSemverCore(left: string, right: string): number {
  const leftParts = parseSemverCore(left);
  const rightParts = parseSemverCore(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    const comparison = compareNumericParts(leftParts[index], rightParts[index]);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
}

function compareCreatedAtDescending(left: AdminUpdate, right: AdminUpdate): number {
  const leftTime = Date.parse(left.created_at);
  const rightTime = Date.parse(right.created_at);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  if (left.created_at !== right.created_at) {
    return left.created_at < right.created_at ? 1 : -1;
  }
  if (left.id === right.id) {
    return 0;
  }
  return left.id < right.id ? -1 : 1;
}

export function sortAdminUpdates(updates: readonly AdminUpdate[]): AdminUpdate[] {
  return [...updates].sort((left, right) => {
    if (left.completed_version === null && right.completed_version !== null) {
      return -1;
    }
    if (left.completed_version !== null && right.completed_version === null) {
      return 1;
    }
    if (left.completed_version !== null && right.completed_version !== null) {
      const versionOrder = compareSemverCore(right.completed_version, left.completed_version);
      if (versionOrder !== 0) {
        return versionOrder;
      }
    }
    return compareCreatedAtDescending(left, right);
  });
}
