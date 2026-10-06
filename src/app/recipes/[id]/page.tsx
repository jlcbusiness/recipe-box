import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRecipe, getRecipePicklists, recipeStateLabels } from '../../../lib/recipes/data';
import { formatIngredientDisplay } from '../../../lib/recipes/ingredient-rules';
import {
  getSafeInstructionHref,
  type InstructionInlineToken,
  parseInstructionMarkdown,
} from '../../../lib/recipes/instruction-markdown';
import { createClient } from '../../../lib/supabase/server';
import { RecipePrintAction } from '../recipe-detail-actions';

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

function renderInstructionMarkdown(
  value: string,
  ingredients: readonly { id: string; name: string }[],
) {
  const namesById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.name]));
  const headingTags = [null, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
  const lowercaseFirst = (value: string) =>
    value ? `${value[0].toLocaleLowerCase()}${value.slice(1)}` : '';
  const renderInline = (tokens: InstructionInlineToken[], prefix: string) => {
    let precedingText = '';
    return tokens.map((token, index) => {
      const key = `${prefix}-${index}`;
      switch (token.type) {
        case 'text': {
          precedingText += token.value;
          return token.value;
        }
        case 'strong':
          precedingText += token.value;
          return <strong key={key}>{token.value}</strong>;
        case 'emphasis':
          precedingText += token.value;
          return <em key={key}>{token.value}</em>;
        case 'strike':
          precedingText += token.value;
          return <del key={key}>{token.value}</del>;
        case 'code':
          precedingText += token.value;
          return <code key={key}>{token.value}</code>;
        case 'link': {
          precedingText += token.label;
          const href = getSafeInstructionHref(token.url);
          return href ? (
            <a className="recipe-instruction-link" href={href} key={key}>
              {token.label}
            </a>
          ) : (
            token.label
          );
        }
        case 'mention': {
          const name = namesById.get(token.id);
          if (!name) {
            throw new Error(
              'Instruction mentions must reference an ingredient row in this recipe.',
            );
          }
          const startsSentence = !precedingText || /[.!?]["')\]]*\s*$/u.test(precedingText);
          const displayName = startsSentence ? name : lowercaseFirst(name);
          precedingText += displayName;
          return (
            <span className="recipe-instruction-mention" key={key}>
              {displayName}
            </span>
          );
        }
        default: {
          const exhaustiveToken: never = token;
          return exhaustiveToken;
        }
      }
    });
  };

  return parseInstructionMarkdown(value).map((block, index) => {
    const key = `block-${index}`;
    if (block.type === 'heading') {
      const Heading = headingTags[block.level] ?? 'p';
      return <Heading key={key}>{renderInline(block.content, key)}</Heading>;
    }
    if (block.type === 'list') {
      const List = block.ordered ? 'ol' : 'ul';
      const occurrences = new Map<string, number>();
      return (
        <List key={key}>
          {block.items.map((item) => {
            const signature = item
              .map((token) =>
                token.type === 'mention'
                  ? `${token.type}:${token.id}`
                  : token.type === 'link'
                    ? `${token.type}:${token.url}:${token.label}`
                    : `${token.type}:${token.value}`,
              )
              .join('|');
            const occurrence = occurrences.get(signature) ?? 0;
            occurrences.set(signature, occurrence + 1);
            const itemKey = `${key}-${signature}-${occurrence}`;
            return <li key={itemKey}>{renderInline(item, itemKey)}</li>;
          })}
        </List>
      );
    }
    return <p key={key}>{renderInline(block.content, key)}</p>;
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
          {recipe.publication && (
            <p className="recipe-attribution">
              <span>From </span>
              <Link href={`/publications/${recipe.publication.id}`}>
                <cite>{recipe.publication.name}</cite>
              </Link>
              {recipe.publication.issue ? ` · ${recipe.publication.issue}` : ''}
              {recipe.publication_page ? ` · p. ${recipe.publication_page}` : ''}
              {recipe.recipe_url && (
                <>
                  {' · '}
                  <a className="recipe-source-link" href={recipe.recipe_url}>
                    {recipe.recipe_url}
                  </a>
                </>
              )}
            </p>
          )}
        </div>
        <div className="recipe-detail-heading-actions recipe-screen-only">
          <RecipePrintAction />
          <Link
            aria-label="Edit"
            className="recipe-primary-link recipe-edit-link recipe-detail-action recipe-icon-action"
            href={`/recipes/${recipe.id}/edit`}
            title="Edit recipe"
          >
            <Pencil aria-hidden="true" size={16} strokeWidth={2} />
          </Link>
        </div>
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
          <div className="recipe-detail-times">
            <h3 className="recipe-detail-times-title">Times</h3>
            <dl className="recipe-metadata recipe-time-list">
              {times.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value} min</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>
      {recipe.ingredients.length > 0 && (
        <section className="recipe-detail-section" aria-labelledby="ingredients-title">
          <h2 id="ingredients-title">Ingredients</h2>
          <ol className="recipe-ingredient-list">
            {recipe.ingredients.map((ingredient) => (
              <li key={ingredient.id}>
                <span className="recipe-ingredient-name">
                  {formatIngredientDisplay(ingredient)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {recipe.steps.length > 0 && (
        <section className="recipe-detail-section" aria-labelledby="instructions-title">
          <h2 id="instructions-title">Instructions</h2>
          <ol className="recipe-instruction-list">
            {recipe.steps.map((step) => (
              <li key={step.id}>
                {renderInstructionMarkdown(
                  step.content_markdown,
                  recipe.ingredients.map((ingredient) => ({
                    id: ingredient.id,
                    name: ingredient.ingredient_name,
                  })),
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
      {recipe.notes_markdown && (
        <section className="recipe-detail-section" aria-labelledby="notes-title">
          <h2 id="notes-title">Notes</h2>
          <p className="recipe-notes">{renderMarkdown(recipe.notes_markdown)}</p>
        </section>
      )}
    </main>
  );
}
