import { Ban, Printer } from 'lucide-react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { type ReactNode, useState } from 'react';
import { ImageViewer } from '../../app/media/image-viewer';
import {
  RecipeInstructionMention,
  RecipeReader,
  RecipeReaderProvider,
} from '../../app/recipes/recipe-reader';
import type { RecipeIngredient } from '../../lib/recipes/data';
import {
  type InstructionInlineToken,
  parseInstructionMarkdown,
} from '../../lib/recipes/instruction-markdown';
import { formatGroupedInteger, type MeasurementSystem } from '../../lib/recipes/measurement-rules';
import { getPublicRecipePageData, type PublicRecipePhoto } from '../../lib/recipes/public-data';
import {
  getSafePublicReferenceHref,
  type PublicRecipePayload,
} from '../../lib/recipes/public-rules';
import { formatRecipeDuration } from '../../lib/recipes/recipe-rules';

type PublicRecipePageProps =
  | { state: 'unavailable' | 'gone' }
  | { state: 'active'; recipe: PublicRecipePayload; photos: PublicRecipePhoto[] };

function withOccurrenceKeys<T>(items: T[], getIdentity: (item: T) => string) {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const identity = getIdentity(item);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { item, key: `${identity}-${occurrence}` };
  });
}

export const getServerSideProps = (async ({ params, res }) => {
  const publicId = params?.publicId;
  const result = await getPublicRecipePageData(
    Array.isArray(publicId) ? (publicId[0] ?? '') : (publicId ?? ''),
  );
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');

  if (result.status !== 'active') {
    res.statusCode = result.status === 'gone' ? 410 : 404;
    return { props: { state: result.status } };
  }
  return { props: { state: 'active', recipe: result.recipe, photos: result.photos } };
}) satisfies GetServerSideProps<PublicRecipePageProps>;

function renderInstructionBlocks(
  markdown: string,
  ingredients: RecipeIngredient[],
  unitSystems: { volume: MeasurementSystem; weight: MeasurementSystem },
  preserveStoredUnits: boolean,
  photos: PublicRecipePhoto[],
): ReactNode {
  const ingredientsById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const headingTags = [null, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;
  const renderInline = (tokens: InstructionInlineToken[], prefix: string) => {
    const photoOccurrences = new Map<string, number>();
    return tokens.map((token, index) => {
      const key = `${prefix}-${index}`;
      switch (token.type) {
        case 'photo': {
          const photo = photos.find((candidate) => candidate.id === token.id);
          const occurrence = photoOccurrences.get(token.id) ?? 0;
          photoOccurrences.set(token.id, occurrence + 1);
          return photo ? (
            <ImageViewer
              alt=""
              buttonLabel="View instruction photo full size"
              crop={photo.crop}
              height={photo.height}
              key={`${prefix}-photo-${token.id}-${occurrence}`}
              src={photo.full_url}
              triggerClassName={`recipe-instruction-photo${token.alignment === 'left' ? ' is-left' : ''}`}
              triggerStyle={{ width: token.width ?? 200 }}
              width={photo.width}
            />
          ) : null;
        }
        case 'text':
          return token.value;
        case 'strong':
          return <strong key={key}>{token.value}</strong>;
        case 'emphasis':
          return <em key={key}>{token.value}</em>;
        case 'strike':
          return <del key={key}>{token.value}</del>;
        case 'code':
          return <code key={key}>{token.value}</code>;
        case 'duration':
          return (
            <span className="recipe-instruction-duration" key={key}>
              {token.value}
            </span>
          );
        case 'temperature':
          return (
            <span className="recipe-instruction-temperature" key={key}>
              {token.value}
            </span>
          );
        case 'link': {
          const href = getSafePublicReferenceHref(token.url);
          return href ? (
            <a href={href} key={key} rel="noreferrer">
              {token.label}
            </a>
          ) : (
            token.label
          );
        }
        case 'mention': {
          const ingredient = ingredientsById.get(token.id);
          return ingredient ? (
            <RecipeInstructionMention
              displayName={ingredient.ingredient_name}
              ingredient={ingredient}
              key={key}
              preserveStoredUnits={preserveStoredUnits}
              unitSystems={unitSystems}
            />
          ) : (
            `#${token.slug}`
          );
        }
        default: {
          const exhaustiveToken: never = token;
          return exhaustiveToken;
        }
      }
    });
  };

  return parseInstructionMarkdown(markdown).map((block, index) => {
    const key = `instruction-${index}`;
    if (block.type === 'heading') {
      const Heading = headingTags[block.level] ?? 'p';
      return (
        <Heading
          className={
            block.content.some((token) => token.type === 'photo')
              ? 'recipe-instruction-with-photo'
              : undefined
          }
          key={key}
        >
          {renderInline(block.content, key)}
        </Heading>
      );
    }
    if (block.type === 'list') {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List key={key}>
          {withOccurrenceKeys(block.items, (item) => JSON.stringify(item) ?? '').map(
            ({ item, key: itemKey }) => (
              <li
                className={
                  item.some((token) => token.type === 'photo')
                    ? 'recipe-instruction-with-photo'
                    : undefined
                }
                key={`${key}-${itemKey}`}
              >
                {renderInline(item, `${key}-${itemKey}`)}
              </li>
            ),
          )}
        </List>
      );
    }
    return (
      <p
        className={
          block.content.some((token) => token.type === 'photo')
            ? 'recipe-instruction-with-photo'
            : undefined
        }
        key={key}
      >
        {renderInline(block.content, key)}
      </p>
    );
  });
}

function RecipePhotos({ photos, name }: { photos: PublicRecipePhoto[]; name: string }) {
  if (photos.length === 0) return null;
  return (
    <section className="recipe-photo-gallery" aria-label={`${name} photos`}>
      {withOccurrenceKeys(
        photos,
        (photo) => `${photo.description}-${photo.width}-${photo.height}`,
      ).map(({ item: photo, key }, index) => (
        <ImageViewer
          alt={photo.description || `${name}, photo ${index + 1}`}
          buttonLabel={`View ${photo.description || `${name}, photo ${index + 1}`} full size`}
          crop={photo.crop}
          height={photo.height}
          imageClassName="recipe-public-photo"
          key={key}
          src={photo.full_url}
          triggerClassName="recipe-public-photo-trigger"
          triggerLoading="eager"
          width={photo.width}
        />
      ))}
    </section>
  );
}

export default function PublicRecipePage(props: PublicRecipePageProps) {
  const [disableInstructionEmphasis, setDisableInstructionEmphasis] = useState(false);

  if (props.state !== 'active') {
    return (
      <main className="recipes-main recipe-public-main">
        <section className="recipe-detail-section" aria-labelledby="public-status-title">
          <h1 id="public-status-title">
            {props.state === 'gone' ? 'Recipe no longer available' : 'Recipe unavailable'}
          </h1>
          <p>
            {props.state === 'gone'
              ? 'This recipe is no longer available.'
              : 'This recipe is currently unavailable.'}
          </p>
        </section>
      </main>
    );
  }

  const { recipe, photos } = props;
  const times = [
    ['Prep', recipe.timings.prep],
    ['Mixing', recipe.timings.mixing],
    ['Marinate', recipe.timings.marinate],
    ['Chill', recipe.timings.chill],
    ['Freeze', recipe.timings.freeze],
    ['Cook', recipe.timings.cook],
    ['Bake', recipe.timings.bake],
    ['Cooling', recipe.timings.cooling],
    ['Rest', recipe.timings.rest],
    ['Total', recipe.timings.total],
  ].filter(([, value]) => value !== null);
  const hasPublicSummary = times.length > 0 || recipe.equipment.length > 0;
  const preserveStoredUnits = true;
  const unitSystems = { volume: 'us_customary' as const, weight: 'us_customary' as const };
  const instructions = recipe.steps.length > 0 && (
    <section className="recipe-detail-section" aria-labelledby="instructions-title">
      <h2 id="instructions-title">Instructions</h2>
      <ol className="recipe-instruction-list">
        {recipe.steps.map((step) => (
          <li key={step.position}>
            {renderInstructionBlocks(
              step.content_markdown,
              recipe.ingredients,
              unitSystems,
              preserveStoredUnits,
              photos,
            )}
          </li>
        ))}
      </ol>
    </section>
  );

  return (
    <main
      className={`recipes-main recipe-public-main${disableInstructionEmphasis ? ' no-instruction-emphasis' : ''}`}
      aria-labelledby="page-title"
    >
      <Head>
        <title>{`${recipe.name} | Recipe Box`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="recipe-page-heading recipe-detail-heading">
        <div className="recipe-detail-title">
          <div className="recipe-detail-title-row">
            <h1 id="page-title">
              {recipe.name}
              {recipe.serves !== null && (
                <span className="recipe-public-serves-inline">
                  {' - serves '}
                  {formatGroupedInteger(recipe.serves)}
                </span>
              )}
            </h1>
            <div className="recipe-public-title-actions">
              <button
                aria-label="Print recipe"
                className="recipe-secondary-button recipe-detail-action recipe-icon-action recipe-screen-only"
                title="Print recipe"
                type="button"
                onClick={() => window.print()}
              >
                <Printer aria-hidden="true" size={16} strokeWidth={2} />
              </button>
              <button
                aria-label="No emphasis"
                aria-pressed={disableInstructionEmphasis}
                className="recipe-secondary-button recipe-detail-action recipe-icon-action recipe-screen-only"
                title="No emphasis"
                type="button"
                onClick={() => setDisableInstructionEmphasis((current) => !current)}
              >
                <Ban aria-hidden="true" size={16} strokeWidth={2} />
              </button>
            </div>
          </div>
          {recipe.attribution && (
            <p className="recipe-attribution">
              <cite>{recipe.attribution.publication_name}</cite>
              {recipe.attribution.page ? ` · p. ${recipe.attribution.page}` : ''}
            </p>
          )}
        </div>
      </div>
      {(photos.length > 0 || hasPublicSummary) && (
        <div
          className={`recipe-public-overview${
            photos.length > 0 && hasPublicSummary ? ' recipe-public-overview-split' : ''
          }`}
        >
          <RecipePhotos name={recipe.name} photos={photos} />
          {hasPublicSummary && (
            <div className="recipe-public-summary">
              {times.length > 0 && (
                <section className="recipe-detail-section" aria-labelledby="timings-title">
                  <h2 id="timings-title">Time Breakdown</h2>
                  <dl className="recipe-metadata recipe-time-list">
                    {times.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{formatRecipeDuration(value as number)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              {recipe.equipment.length > 0 && (
                <section className="recipe-detail-section" aria-labelledby="equipment-title">
                  <h2 id="equipment-title">Equipment</h2>
                  <ul className="recipe-relationship-list">
                    {recipe.equipment.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>
      )}
      <RecipeReaderProvider serves={recipe.serves}>
        {recipe.ingredients.length > 0 ? (
          <RecipeReader
            defaultPresentation="ingredient_first"
            ingredients={recipe.ingredients}
            ingredientSets={recipe.ingredient_sets}
            instructions={instructions || undefined}
            preserveStoredUnits={preserveStoredUnits}
            recipeId="public-recipe"
            serves={recipe.serves}
            steps={recipe.steps}
            volumeSystem={unitSystems.volume}
            weightSystem={unitSystems.weight}
          />
        ) : (
          instructions
        )}
      </RecipeReaderProvider>
      {recipe.pairings.length > 0 && (
        <section className="recipe-detail-section" aria-labelledby="pairs-with-title">
          <h2 id="pairs-with-title">Pairs With</h2>
          <ul className="recipe-relationship-list">
            {withOccurrenceKeys(recipe.pairings, (item) => item).map(({ item, key }) => (
              <li key={key}>{item}</li>
            ))}
          </ul>
        </section>
      )}
      {recipe.references.length > 0 && (
        <section className="recipe-detail-section" aria-labelledby="references-title">
          <h2 id="references-title">References</h2>
          <ul className="recipe-relationship-list">
            {withOccurrenceKeys(
              recipe.references,
              (reference) => `${reference.display_text}-${reference.href ?? ''}`,
            ).map(({ item: reference, key }) => {
              const href = getSafePublicReferenceHref(reference.href);
              return (
                <li key={key}>
                  {href ? (
                    <a href={href} rel="noreferrer">
                      {reference.display_text}
                    </a>
                  ) : (
                    reference.display_text
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
