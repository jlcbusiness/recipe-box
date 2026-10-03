import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRecipe, getRecipePicklists, recipeStateLabels } from '../../../lib/recipes/data';
import { createClient } from '../../../lib/supabase/server';

type RecipeDetailPageProps = {
  params: Promise<{ id: string }>;
};

function renderMarkdown(value: string) {
  const occurrences = new Map<string, number>();
  return value.split(/(\*\*[^*]+\*\*)/g).map((part) => {
    if (!part.startsWith('**') || !part.endsWith('**')) {
      return part;
    }

    const occurrence = occurrences.get(part) ?? 0;
    occurrences.set(part, occurrence + 1);
    return <strong key={`${part}-${occurrence}`}>{part.slice(2, -2)}</strong>;
  });
}

export default async function RecipeDetailPage({ params }: RecipeDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const [recipe, picklists] = await Promise.all([
    getRecipe(supabase, id),
    getRecipePicklists(supabase),
  ]);
  if (!recipe) {
    notFound();
  }

  const valueFor = (valueId: string | null) =>
    picklists.find((value) => value.id === valueId)?.value;
  const assignedValues = (category: 'meal_type' | 'cuisine' | 'equipment', ids: string[]) =>
    ids
      .map(
        (valueId) =>
          picklists.find((value) => value.id === valueId && value.category === category)?.value,
      )
      .filter((value): value is string => Boolean(value));
  const response =
    recipe.state === 'want_to_try'
      ? ['Enthusiasm', valueFor(recipe.enthusiasm_id)]
      : recipe.state === 'tried'
        ? ['Verdict', valueFor(recipe.verdict_id)]
        : ['Reason', recipe.reason];
  const sections = [
    ['State', recipeStateLabels[recipe.state]],
    response,
    ['Occasion Details', recipe.occasion_details],
    ['Serves', recipe.serves?.toString()],
    ['Total time', recipe.total_time_minutes === null ? null : `${recipe.total_time_minutes} min`],
    ['Equipment', assignedValues('equipment', recipe.equipment_ids).join(', ')],
  ].filter(([, value]) => Boolean(value));
  const classificationSections = [
    ['Food Type', valueFor(recipe.food_type_id)],
    ['Meal Type', assignedValues('meal_type', recipe.meal_type_ids).join(', ')],
    ['Cuisine', assignedValues('cuisine', recipe.cuisine_ids).join(', ')],
  ].filter(([, value]) => Boolean(value));
  const times = [
    ['Prep', recipe.prep_time_minutes],
    ['Mixing', recipe.mixing_time_minutes],
    ['Marinate', recipe.marinate_time_minutes],
    ['Chill', recipe.chill_time_minutes],
    ['Freeze', recipe.freeze_time_minutes],
    ['Cook', recipe.cook_time_minutes],
    ['Bake', recipe.bake_time_minutes],
    ['Cooling', recipe.cooling_time_minutes],
    ['Rest', recipe.rest_time_minutes],
  ].filter(([, value]) => value !== null);

  return (
    <main className="recipes-main" aria-labelledby="page-title">
      <div className="recipe-page-heading recipe-detail-heading">
        <div className="recipe-detail-title">
          <h1 id="page-title">{recipe.name}</h1>
        </div>
        <Link
          aria-label="Edit"
          className="recipe-primary-link recipe-edit-link"
          href={`/recipes/${recipe.id}/edit`}
        >
          <span className="recipe-edit-desktop">Edit</span>
          <span aria-hidden="true" className="recipe-edit-mobile">
            Edit
          </span>
        </Link>
      </div>
      <section className="recipe-detail-section" aria-labelledby="metadata-title">
        <h2 id="metadata-title">Recipe details</h2>
        {sections.length > 0 && (
          <dl className="recipe-metadata">
            {sections.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {classificationSections.length > 0 && (
          <dl className="recipe-metadata recipe-detail-classification">
            {classificationSections.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {times.length > 0 && (
          <dl className="recipe-metadata recipe-time-list">
            {times.map(([label, value]) => (
              <div key={label}>
                <dt>{label} time</dt>
                <dd>{value} min</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      {recipe.notes_markdown && (
        <section className="recipe-detail-section" aria-labelledby="notes-title">
          <h2 id="notes-title">Notes</h2>
          <p className="recipe-notes">{renderMarkdown(recipe.notes_markdown)}</p>
        </section>
      )}
    </main>
  );
}
