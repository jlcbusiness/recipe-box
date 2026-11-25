import {
  buildRecipeJsonTemplate,
  getStandardRecipeJsonSchema,
  getStrictRecipeJsonSchema,
} from '../../../lib/recipe-json/schema-template';
import type { RecipePicklistValue } from '../../../lib/recipes/data';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ error: 'Sign in before downloading recipe JSON tools.' }, 401);
  }

  const asset = new URL(request.url).searchParams.get('asset');
  if (asset === 'schema') {
    return jsonResponse(getStandardRecipeJsonSchema());
  }
  if (asset !== 'template' && asset !== 'strict-schema') {
    return jsonResponse({ error: 'Choose a supported recipe JSON download.' }, 400);
  }

  const { data, error } = await supabase
    .from('recipe_picklist_values')
    .select('id, account_id, category, value, display_value, sort_order, is_protected')
    .order('category')
    .order('sort_order');
  if (error || !data) {
    return jsonResponse({ error: 'Unable to load current recipe options.' }, 503);
  }
  const picklists = data as RecipePicklistValue[];

  if (asset === 'template') {
    return new Response(buildRecipeJsonTemplate(picklists), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/jsonc; charset=utf-8',
      },
    });
  }
  return jsonResponse(getStrictRecipeJsonSchema(picklists));
}
