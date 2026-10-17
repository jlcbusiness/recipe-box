import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRecipePhotos } from '../../../lib/media/data';
import type { RecipeIngredient } from '../../../lib/recipes/data';
import { getRecipe, getRecipePicklists, recipeStateLabels } from '../../../lib/recipes/data';
import {
  getSafeInstructionHref,
  type InstructionInlineToken,
  parseInstructionMarkdown,
} from '../../../lib/recipes/instruction-markdown';
import {
  formatGroupedInteger,
  type MeasurementSystem,
} from '../../../lib/recipes/measurement-rules';
import { createClient } from '../../../lib/supabase/server';
import { ExportAction } from '../../export-action';
import { RecipePhotoGallery } from '../../media/media-display';
import { TagChips } from '../../tags/tag-controls';
import { RecipePrintAction } from '../recipe-detail-actions';
import {
  RecipeInstructionMention,
  RecipeReader,
  RecipeReaderProvider,
  RecipeServesControl,
} from '../recipe-reader';
import { RecipeShareActions } from '../recipe-share-actions';
import { RecipeSummaryLayout } from '../recipe-summary-layout';

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
  ingredients: readonly RecipeIngredient[],
  unitSystems: { volume: MeasurementSystem; weight: MeasurementSystem },
) {
  const ingredientsById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const headingTags = [null, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
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
          const ingredient = ingredientsById.get(token.id);
          if (!ingredient) {
            throw new Error(
              'Instruction mentions must reference an ingredient row in this recipe.',
            );
          }
          const startsSentence = !precedingText || /[.!?]["')\]]*\s*$/u.test(precedingText);
          const displayName = startsSentence
            ? ingredient.ingredient_name
            : ingredient.ingredient_name.toLocaleLowerCase();
          precedingText += displayName;
          return (
            <RecipeInstructionMention
              displayName={displayName}
              ingredient={ingredient}
              key={key}
              unitSystems={unitSystems}
            />
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
  const { data: authData } = await supabase.auth.getUser();
  const [recipe, picklists, photos] = await Promise.all([
    getRecipe(supabase, id),
    getRecipePicklists(supabase),
    getRecipePhotos(supabase, id),
  ]);
  let volumeSystem: MeasurementSystem = 'us_customary';
  let weightSystem: MeasurementSystem = 'us_customary';
  let ingredientPresentation: 'standard' | 'ingredient_first' = 'standard';
  if (authData.user) {
    const { data: account } = await supabase
      .from('accounts')
      .select('volume_system, weight_system, ingredient_presentation')
      .eq('id', authData.user.id)
      .maybeSingle();
    volumeSystem = account?.volume_system === 'metric' ? 'metric' : 'us_customary';
    weightSystem = account?.weight_system === 'metric' ? 'metric' : 'us_customary';
    ingredientPresentation =
      account?.ingredient_presentation === 'ingredient_first' ? 'ingredient_first' : 'standard';
  }
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
    ['Serves', recipe.serves === null ? null : formatGroupedInteger(recipe.serves)],
    [
      'Total time',
      recipe.total_time_minutes === null
        ? null
        : `${formatGroupedInteger(recipe.total_time_minutes)} min`,
    ],
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
  const unitSystems = { volume: volumeSystem, weight: weightSystem };
  const instructions = recipe.steps.length > 0 && (
    <section className="recipe-detail-section" aria-labelledby="instructions-title">
      <h2 id="instructions-title">Instructions</h2>
      <ol className="recipe-instruction-list">
        {recipe.steps.map((step) => (
          <li key={step.id}>
            {renderInstructionMarkdown(step.content_markdown, recipe.ingredients, unitSystems)}
          </li>
        ))}
      </ol>
    </section>
  );

  return (
    <main
      className={`recipes-main${recipe.publication?.publication_type === 'collection' ? ' recipe-tin-theme recipe-tin-recipe-theme' : ''}`}
      aria-labelledby="page-title"
    >
      <div className="recipe-page-heading recipe-detail-heading">
        <div className="recipe-detail-title">
          <h1 id="page-title">{recipe.name}</h1>
          {recipe.publication && (
            <p className="recipe-attribution">
              <span>
                {recipe.publication.publication_type === 'collection' ? 'In the ' : 'From '}
              </span>
              <Link href={`/publications/${recipe.publication.id}`}>
                <cite>{recipe.publication.name}</cite>
              </Link>
              {recipe.publication.publication_type !== 'collection' && recipe.publication_page
                ? ` · ${recipe.publication.publication_type === 'book' ? `p. ${recipe.publication_page}` : recipe.publication_page}`
                : ''}
              {recipe.publication.publication_type !== 'collection' && recipe.recipe_url && (
                <a className="recipe-source-link" href={recipe.recipe_url}>
                  <span className="recipe-source-url-full">{recipe.recipe_url}</span>
                  <span className="recipe-source-url-mobile">View online</span>
                </a>
              )}
            </p>
          )}
        </div>
        <div className="recipe-detail-heading-actions recipe-screen-only">
          <RecipeShareActions
            isPrivate={recipe.is_private}
            publicId={recipe.public_id}
            recipeId={recipe.id}
            version={recipe.version}
          />
          <RecipePrintAction />
          <ExportAction
            ariaLabel="Export recipe"
            buttonLabel="Export recipe"
            buttonClassName="recipe-secondary-button recipe-detail-action recipe-icon-action"
            className="recipe-detail-export-action"
            scope={{ type: 'recipe', id: recipe.id }}
          />
          <Link
            aria-label="Edit"
            className="recipe-primary-link recipe-edit-link recipe-detail-action recipe-icon-action"
            href={`/recipes/${recipe.id}/edit`}
            title="Edit recipe"
          >
            <Pencil aria-hidden="true" size={16} strokeWidth={2} />
          </Link>
        </div>
        {recipe.tags.length > 0 && (
          <div className="recipe-detail-tags-row">
            <TagChips tags={recipe.tags} />
          </div>
        )}
      </div>
      <RecipeReaderProvider serves={recipe.serves}>
        <RecipeSummaryLayout hasPhotos={photos.length > 0}>
          <RecipePhotoGallery photos={photos} />
          <section className="recipe-detail-section" aria-labelledby="metadata-title">
            <h2 id="metadata-title">Recipe details</h2>
            {sections.length > 0 && (
              <dl className="recipe-metadata">
                {sections.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    {label === 'Serves' && recipe.serves !== null ? (
                      <RecipeServesControl serves={recipe.serves} />
                    ) : (
                      <dd>{value}</dd>
                    )}
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
                      <dd>{formatGroupedInteger(value as number)} min</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>
        </RecipeSummaryLayout>
        {recipe.ingredients.length > 0 && (
          <RecipeReader
            defaultPresentation={ingredientPresentation}
            ingredients={recipe.ingredients}
            instructions={instructions}
            recipeId={recipe.id}
            serves={recipe.serves}
            steps={recipe.steps}
            volumeSystem={volumeSystem}
            weightSystem={weightSystem}
          />
        )}
      </RecipeReaderProvider>
      {recipe.ingredients.length === 0 && instructions}
      {(recipe.pairings.length > 0 || recipe.incoming_pairings.length > 0) && (
        <section className="recipe-detail-section" aria-labelledby="pairs-with-title">
          <h2 id="pairs-with-title">Pairs With</h2>
          {recipe.pairings.length > 0 && (
            <ul className="recipe-relationship-list">
              {recipe.pairings.map((pairing) => (
                <li key={pairing.id}>
                  {pairing.linked_recipe_id && pairing.linked_recipe_is_active ? (
                    <Link href={`/recipes/${pairing.linked_recipe_id}`}>
                      {pairing.display_text}
                    </Link>
                  ) : (
                    pairing.display_text
                  )}
                </li>
              ))}
            </ul>
          )}
          {recipe.incoming_pairings.length > 0 && (
            <div className="recipe-incoming-pairings">
              <h3>Paired with this recipe</h3>
              <ul className="recipe-relationship-list">
                {recipe.incoming_pairings.map((pairing) => (
                  <li key={pairing.source_recipe_id}>
                    {pairing.source_recipe_is_active ? (
                      <Link href={`/recipes/${pairing.source_recipe_id}`}>
                        {pairing.source_recipe_name}
                      </Link>
                    ) : (
                      pairing.source_recipe_name
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {recipe.notes_markdown && (
        <section className="recipe-detail-section" aria-labelledby="notes-title">
          <h2 id="notes-title">Notes</h2>
          <p className="recipe-notes">{renderMarkdown(recipe.notes_markdown)}</p>
        </section>
      )}
      {recipe.references.length > 0 && (
        <section className="recipe-detail-section" aria-labelledby="references-title">
          <h2 id="references-title">References</h2>
          <ul className="recipe-relationship-list">
            {recipe.references.map((reference) => (
              <li key={reference.id}>
                {reference.reference_type === 'external_url' && reference.url ? (
                  <a href={reference.url}>{reference.display_text}</a>
                ) : reference.reference_type === 'recipe' &&
                  reference.linked_recipe_id &&
                  reference.linked_recipe_is_active ? (
                  <Link href={`/recipes/${reference.linked_recipe_id}`}>
                    {reference.display_text}
                  </Link>
                ) : (
                  reference.display_text
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link className="recipe-history-link" href={`/recipes/${recipe.id}/history`}>
        History
      </Link>
    </main>
  );
}
