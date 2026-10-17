export const PRIVATE_OFFLINE_CACHE_PREFIX = 'recipe-box-private-';
export const PRIVATE_OFFLINE_CACHE_NAME = `${PRIVATE_OFFLINE_CACHE_PREFIX}v1`;
export const OFFLINE_INDEX_PATH = '/__recipe-box/offline-index';
export const MAX_OFFLINE_RECIPES = 10;

export type OfflineRecipeEntry = {
  path: string;
  title: string;
  viewedAt: number;
  styles?: string[];
};

const recipeDetailPathPattern =
  /^\/recipes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOfflineRecipePath(path: string): boolean {
  return recipeDetailPathPattern.test(path);
}

export function selectRecentOfflineRecipes(
  entries: readonly OfflineRecipeEntry[],
): OfflineRecipeEntry[] {
  const newestByPath = new Map<string, OfflineRecipeEntry>();

  for (const entry of entries) {
    if (
      !isOfflineRecipePath(entry.path) ||
      !entry.title.trim() ||
      !Number.isFinite(entry.viewedAt)
    ) {
      continue;
    }

    const previous = newestByPath.get(entry.path);
    if (!previous || entry.viewedAt > previous.viewedAt) {
      newestByPath.set(entry.path, { ...entry, title: entry.title.trim() });
    }
  }

  return [...newestByPath.values()]
    .sort((left, right) => right.viewedAt - left.viewedAt || left.path.localeCompare(right.path))
    .slice(0, MAX_OFFLINE_RECIPES);
}
