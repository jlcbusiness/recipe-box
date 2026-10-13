import 'server-only';
import type { PublicationType, RecipeSupabaseClient } from '../recipes/data';

export type PublicationSearchFilterField =
  | 'name'
  | 'author'
  | 'edition'
  | 'isbn'
  | 'retailer_url'
  | 'site_url'
  | 'publication_type'
  | 'tag'
  | 'recipe_count'
  | 'created_at'
  | 'updated_at';

export type PublicationSearchFilter = {
  field: PublicationSearchFilterField;
  operator: string;
  value?: string | number | string[];
  value_to?: string | number;
};

export type PublicationSearchSortKey =
  | 'relevance'
  | 'name'
  | 'type'
  | 'author'
  | 'edition'
  | 'recipe_count'
  | 'created_at'
  | 'updated_at';

export type PublicationSearchResult = {
  publication_id: string;
  publication_type: PublicationType;
  name: string;
  author: string | null;
  edition: string | null;
  issue: string | null;
  isbn: string | null;
  retailer_url: string | null;
  site_url: string | null;
  recipe_count: number;
  created_at: string;
  updated_at: string;
  tag_ids: string[];
  tag_names: string[];
  rank: number;
  total_count: number;
};

export type PublicationSearchOptions = {
  filters?: PublicationSearchFilter[];
  publicationType?: PublicationType;
  sortKey?: PublicationSearchSortKey;
  sortDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
};

export function parsePublicationSearchFilters(
  input: string | string[] | undefined,
): PublicationSearchFilter[] {
  const values = Array.isArray(input) ? input : input ? [input] : [];
  return values.slice(0, 10).flatMap((value) => {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'field' in parsed &&
        typeof parsed.field === 'string' &&
        'operator' in parsed &&
        typeof parsed.operator === 'string'
      ) {
        return [parsed as PublicationSearchFilter];
      }
    } catch {
      return [];
    }
    return [];
  });
}

export async function searchPublications(
  supabase: RecipeSupabaseClient,
  query: string,
  options: PublicationSearchOptions = {},
): Promise<PublicationSearchResult[]> {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ').slice(0, 500);
  const { data, error } = await supabase.rpc('search_publications', {
    p_query: normalizedQuery || null,
    p_limit: options.limit ?? 50,
    p_offset: options.offset ?? 0,
    p_filters: options.filters ?? [],
    p_sort_key: options.sortKey ?? null,
    p_sort_direction: options.sortDirection ?? 'asc',
    p_publication_type: options.publicationType ?? null,
  });

  if (error) {
    throw new Error('Unable to search publications.');
  }

  return (data ?? []) as PublicationSearchResult[];
}
