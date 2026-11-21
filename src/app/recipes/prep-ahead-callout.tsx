import { ChefHat } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RecipeIngredient } from '../../lib/recipes/data';
import {
  getSafeInstructionHref,
  type PrepAheadInlineToken,
  parsePrepAheadMarkdown,
} from '../../lib/recipes/instruction-markdown';
import type { MeasurementSystemPreference } from '../../lib/recipes/measurement-rules';
import { RecipeInstructionMention } from './recipe-reader';

const headingTags = [null, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

type PrepAheadCalloutProps = {
  markdown: string;
  ingredients?: readonly RecipeIngredient[];
  unitSystems?: {
    volume: MeasurementSystemPreference;
    weight: MeasurementSystemPreference;
  };
  preserveStoredUnits?: boolean;
  emphasisColors?: {
    ingredient?: string | undefined;
    duration?: string | undefined;
  };
};

function renderInline(
  tokens: PrepAheadInlineToken[],
  prefix: string,
  ingredientsById: ReadonlyMap<string, RecipeIngredient>,
  unitSystems: PrepAheadCalloutProps['unitSystems'],
  preserveStoredUnits: boolean,
  emphasisColors: PrepAheadCalloutProps['emphasisColors'],
): ReactNode[] {
  let precedingText = '';
  return tokens.map((token, index) => {
    const key = `${prefix}-${index}`;
    switch (token.type) {
      case 'text': {
        precedingText += token.value;
        return token.value;
      }
      case 'strong': {
        precedingText += token.value;
        return <strong key={key}>{token.value}</strong>;
      }
      case 'emphasis': {
        precedingText += token.value;
        return <em key={key}>{token.value}</em>;
      }
      case 'strike': {
        precedingText += token.value;
        return <del key={key}>{token.value}</del>;
      }
      case 'code': {
        precedingText += token.value;
        return <code key={key}>{token.value}</code>;
      }
      case 'duration':
        precedingText += token.value;
        return (
          <span
            className={`recipe-instruction-duration${emphasisColors === undefined || emphasisColors.duration !== undefined ? '' : ' is-unemphasized'}`}
            key={key}
          >
            <span style={{ color: emphasisColors?.duration ?? 'inherit' }}>{token.value}</span>
          </span>
        );
      case 'link': {
        precedingText += token.label;
        const href = getSafeInstructionHref(token.url);
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
        if (!ingredient || !unitSystems) {
          return `#${token.slug}`;
        }
        const startsSentence = !precedingText || /[.!?]["')\]]*\s*$/u.test(precedingText);
        const displayName = startsSentence
          ? ingredient.ingredient_name
          : ingredient.ingredient_name.toLocaleLowerCase();
        precedingText += displayName;
        return (
          <RecipeInstructionMention
            displayName={displayName}
            emphasisColor={emphasisColors?.ingredient}
            emphasisEnabled={
              emphasisColors === undefined || emphasisColors.ingredient !== undefined
            }
            ingredient={ingredient}
            key={key}
            portionOrdinal={token.portionOrdinal}
            preserveStoredUnits={preserveStoredUnits}
            unitSystems={unitSystems}
          />
        );
      }
    }
    throw new Error('Unsupported prep-ahead Markdown token.');
  });
}

function renderBlocks(
  markdown: string,
  ingredientsById: ReadonlyMap<string, RecipeIngredient>,
  unitSystems: PrepAheadCalloutProps['unitSystems'],
  preserveStoredUnits: boolean,
  emphasisColors: PrepAheadCalloutProps['emphasisColors'],
): ReactNode[] {
  const renderList = (
    list: ReturnType<typeof parsePrepAheadMarkdown>[number] & { type: 'list' },
    prefix: string,
  ): ReactNode => {
    const List = list.ordered ? 'ol' : 'ul';
    return (
      <List key={prefix}>
        {list.items.map((item, index) => {
          const itemKey = `${prefix}-${index}`;
          return (
            <li key={itemKey}>
              {renderInline(
                item.content,
                itemKey,
                ingredientsById,
                unitSystems,
                preserveStoredUnits,
                emphasisColors,
              )}
              {item.children.map((child, childIndex) =>
                renderList(child, `${itemKey}-${childIndex}`),
              )}
            </li>
          );
        })}
      </List>
    );
  };

  return parsePrepAheadMarkdown(markdown).map((block, index) => {
    const key = `prep-ahead-${index}`;
    if (block.type === 'list') return renderList(block, key);
    if (block.type === 'heading') {
      const Heading = headingTags[block.level] ?? 'p';
      return (
        <Heading key={key}>
          {renderInline(
            block.content,
            key,
            ingredientsById,
            unitSystems,
            preserveStoredUnits,
            emphasisColors,
          )}
        </Heading>
      );
    }
    return (
      <p key={key}>
        {renderInline(
          block.content,
          key,
          ingredientsById,
          unitSystems,
          preserveStoredUnits,
          emphasisColors,
        )}
      </p>
    );
  });
}

export function PrepAheadTitleIndicator({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return null;

  return (
    <span className="recipe-prep-ahead-indicator">
      <ChefHat aria-hidden="true" size={15} />
      <span>Pre-recipe Prep</span>
    </span>
  );
}

export function PrepAheadCallout({
  markdown,
  ingredients = [],
  unitSystems,
  preserveStoredUnits = false,
  emphasisColors,
}: PrepAheadCalloutProps) {
  if (!markdown.trim()) return null;
  const ingredientsById = new Map(
    ingredients.map((ingredient) => [ingredient.id.toLocaleLowerCase(), ingredient]),
  );

  return (
    <aside className="recipe-prep-ahead-callout">
      <div className="recipe-prep-ahead-heading">
        <ChefHat aria-hidden="true" size={17} />
        <h3>Pre-recipe Prep</h3>
      </div>
      <div className="recipe-prep-ahead-body">
        {renderBlocks(markdown, ingredientsById, unitSystems, preserveStoredUnits, emphasisColors)}
      </div>
    </aside>
  );
}
