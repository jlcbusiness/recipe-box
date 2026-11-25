export type RecipeJsonIssue = {
  path: string;
  message: string;
};

export class RecipeJsonValidationError extends Error {
  issues: RecipeJsonIssue[];
  constructor(message: string, issues?: RecipeJsonIssue[]);
}

export const RECIPE_JSON_DATA_BYTES_LIMIT: number;
export function validateRecipeJsonValue(value: unknown, schema: object): unknown;
export function parseRecipeJsonBytes(bytes: Uint8Array, fileName: string, schema: object): unknown;
