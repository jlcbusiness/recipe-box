export type InstructionStepDraft = {
  id: string;
  markdown: string;
  plainText: string;
};

export type InstructionMention = {
  recipeIngredientId: string;
  slug: string;
  portionOrdinal: 1 | 2 | null;
};

export type IngredientMentionOptionInput = {
  id: string;
  ingredientId: string;
  name: string;
  setId: string;
  setLabel: string;
  portionAmounts?: readonly [string, string];
};

export type IngredientMentionOption = {
  recipeIngredientId: string;
  ingredientSetId: string;
  portionOrdinal: 1 | 2 | null;
  label: string;
  slug: string;
};

export type InstructionStepPayload = {
  id: string;
  position: number;
  content_markdown: string;
  plain_text: string;
};

const mentionPattern =
  /\[\[ingredient:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?::([12]))?\|([^\]\r\n]+)\]\]/giu;
const mentionPrefixPattern = /\[\[ingredient:/giu;

export function ingredientSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

export function ingredientMentionMarker(mention: {
  recipeIngredientId: string;
  portionOrdinal: 1 | 2 | null;
  slug: string;
}): string {
  const portion = mention.portionOrdinal === null ? '' : `:${mention.portionOrdinal}`;
  return `[[ingredient:${mention.recipeIngredientId}${portion}|${mention.slug}]]`;
}

type InstructionEditorMention = {
  sourceStart: number;
  sourceEnd: number;
  displayStart: number;
  displayEnd: number;
  displayText: string;
  marker: string;
};

function getInstructionEditorMentions(markdown: string): InstructionEditorMention[] {
  const mentions: InstructionEditorMention[] = [];
  let sourceCursor = 0;
  let displayCursor = 0;

  for (const match of markdown.matchAll(new RegExp(mentionPattern))) {
    const sourceStart = match.index ?? 0;
    const rawSlug = match[3] ?? '';
    const legacyPortion = /^([12])\|(.+)$/u.exec(rawSlug);
    const slug = legacyPortion?.[2] ?? rawSlug;
    const portionOrdinal = match[2]
      ? (Number(match[2]) as 1 | 2)
      : legacyPortion
        ? (Number(legacyPortion[1]) as 1 | 2)
        : null;
    const recipeIngredientId = (match[1] ?? '').toLocaleLowerCase();
    const displayText = `#${slug}`;
    displayCursor += sourceStart - sourceCursor;
    mentions.push({
      sourceStart,
      sourceEnd: sourceStart + match[0].length,
      displayStart: displayCursor,
      displayEnd: displayCursor + displayText.length,
      displayText,
      marker: ingredientMentionMarker({ recipeIngredientId, portionOrdinal, slug }),
    });
    sourceCursor = sourceStart + match[0].length;
    displayCursor += displayText.length;
  }

  return mentions;
}

export function getInstructionEditorValue(markdown: string): string {
  return markdown.replace(
    new RegExp(mentionPattern),
    (_marker, _id: string, _portion: string | undefined, rawSlug: string) => {
      const legacyPortion = /^([12])\|(.+)$/u.exec(rawSlug);
      return `#${legacyPortion?.[2] ?? rawSlug}`;
    },
  );
}

export function updateInstructionMarkdownFromEditor(
  previousMarkdown: string,
  editorValue: string,
): string {
  const previousValue = getInstructionEditorValue(previousMarkdown);
  if (previousValue === editorValue) {
    return previousMarkdown;
  }

  let changedStart = 0;
  while (
    changedStart < previousValue.length &&
    changedStart < editorValue.length &&
    previousValue[changedStart] === editorValue[changedStart]
  ) {
    changedStart += 1;
  }

  let unchangedSuffix = 0;
  while (
    unchangedSuffix < previousValue.length - changedStart &&
    unchangedSuffix < editorValue.length - changedStart &&
    previousValue[previousValue.length - unchangedSuffix - 1] ===
      editorValue[editorValue.length - unchangedSuffix - 1]
  ) {
    unchangedSuffix += 1;
  }

  const changedEnd = previousValue.length - unchangedSuffix;
  const offsetChange = editorValue.length - previousValue.length;
  const replacements = getInstructionEditorMentions(previousMarkdown).flatMap((mention) => {
    const isBeforeChange = mention.displayEnd <= changedStart;
    const isAfterChange = mention.displayStart >= changedEnd;
    if (!isBeforeChange && !isAfterChange) {
      return [];
    }

    const displayStart = mention.displayStart + (isAfterChange ? offsetChange : 0);
    if (
      editorValue.slice(displayStart, displayStart + mention.displayText.length) !==
      mention.displayText
    ) {
      return [];
    }
    return [{ ...mention, displayStart }];
  });

  return replacements
    .sort((left, right) => right.displayStart - left.displayStart)
    .reduce(
      (value, mention) =>
        `${value.slice(0, mention.displayStart)}${mention.marker}${value.slice(
          mention.displayStart + mention.displayText.length,
        )}`,
      editorValue,
    );
}

export function replaceInstructionEditorRange(
  markdown: string,
  displayStart: number,
  displayEnd: number,
  replacement: string,
): string {
  const mentions = getInstructionEditorMentions(markdown);
  const toSourceOffset = (displayOffset: number, isEnd: boolean) => {
    let sourceCursor = 0;
    let editorCursor = 0;

    for (const mention of mentions) {
      const plainLength = mention.sourceStart - sourceCursor;
      const plainEnd = editorCursor + plainLength;
      if (displayOffset <= plainEnd) {
        return sourceCursor + displayOffset - editorCursor;
      }
      editorCursor = plainEnd;
      sourceCursor = mention.sourceStart;
      if (displayOffset <= mention.displayEnd) {
        return isEnd ? mention.sourceEnd : mention.sourceStart;
      }
      editorCursor = mention.displayEnd;
      sourceCursor = mention.sourceEnd;
    }

    return sourceCursor + displayOffset - editorCursor;
  };

  const sourceStart = toSourceOffset(displayStart, false);
  const sourceEnd = toSourceOffset(displayEnd, true);
  return `${markdown.slice(0, sourceStart)}${replacement}${markdown.slice(sourceEnd)}`;
}

export function buildIngredientMentionOptions(
  rows: readonly IngredientMentionOptionInput[],
): IngredientMentionOption[] {
  const setIdsByIngredient = new Map<string, Set<string>>();
  for (const row of rows) {
    const ingredientId = row.ingredientId.toLocaleLowerCase();
    const setIds = setIdsByIngredient.get(ingredientId) ?? new Set<string>();
    setIds.add(row.setId);
    setIdsByIngredient.set(ingredientId, setIds);
  }

  return rows.flatMap<IngredientMentionOption>((row) => {
    const ingredientAppearsInMultipleSets =
      (setIdsByIngredient.get(row.ingredientId.toLocaleLowerCase())?.size ?? 0) > 1;
    const rowLabel = ingredientAppearsInMultipleSets ? `${row.name} (${row.setLabel})` : row.name;
    const baseSlug = `${ingredientSlug(row.name)}-${ingredientSlug(row.setLabel)}`;
    if (!row.portionAmounts) {
      return [
        {
          recipeIngredientId: row.id,
          ingredientSetId: row.setId,
          portionOrdinal: null,
          label: rowLabel,
          slug: baseSlug,
        },
      ];
    }

    const [firstAmount, secondAmount] = row.portionAmounts;
    const equalAmounts = firstAmount === secondAmount;
    return row.portionAmounts.map((amount, index) => {
      const portionOrdinal = (index + 1) as 1 | 2;
      const portionLabel = equalAmounts
        ? `${portionOrdinal === 1 ? '1st' : '2nd'} ${amount}`
        : amount;
      return {
        recipeIngredientId: row.id,
        ingredientSetId: row.setId,
        portionOrdinal,
        label: `${rowLabel} (${portionLabel})`,
        slug: `${baseSlug}-${portionOrdinal}`,
      };
    });
  });
}

export function instructionPlainText(markdown: string): string {
  return markdown
    .replace(mentionPattern, (_marker, _id: string, _ordinal: string, rawSlug: string) => {
      const legacyPortion = /^([12])\|(.+)$/u.exec(rawSlug);
      return `#${legacyPortion?.[2] ?? rawSlug}`;
    })
    .replace(/!?\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/(`{1,3})([\s\S]*?)\1/gu, '$2')
    .replace(/(\*\*|__|~~|\*|_)([\s\S]*?)\1/gu, '$2')
    .replace(/^\s{0,3}#{1,6}\s+/gmu, '')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gmu, '')
    .replace(/^\s*>\s?/gmu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function parseIngredientMentions(markdown: string): InstructionMention[] {
  const matches = [...markdown.matchAll(mentionPattern)];
  const prefixes = markdown.match(mentionPrefixPattern) ?? [];
  if (matches.length !== prefixes.length) {
    throw new Error('Instruction contains an invalid ingredient mention.');
  }

  return matches.map((match) => {
    const rawSlug = match[3] ?? '';
    const legacyPortion = /^([12])\|(.+)$/u.exec(rawSlug);
    return {
      recipeIngredientId: (match[1] ?? '').toLocaleLowerCase(),
      slug: legacyPortion?.[2] ?? rawSlug,
      portionOrdinal: match[2]
        ? (Number(match[2]) as 1 | 2)
        : legacyPortion
          ? (Number(legacyPortion[1]) as 1 | 2)
          : null,
    };
  });
}

export function resolveInstructionMentions(
  markdown: string,
  ingredients: readonly { id: string; name: string }[],
): string {
  const namesById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.name]));
  const mentions = parseIngredientMentions(markdown);
  let mentionIndex = 0;

  return markdown.replace(mentionPattern, () => {
    const mention = mentions[mentionIndex++];
    const name = mention ? namesById.get(mention.recipeIngredientId) : undefined;
    if (!name) {
      throw new Error('Instruction mentions must reference an ingredient row in this recipe.');
    }
    return name;
  });
}

export function unlinkIngredientMentions(
  markdown: string,
  recipeIngredientId: string,
  ingredientName: string,
): string {
  parseIngredientMentions(markdown);
  const escapedId = recipeIngredientId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const targetPattern = new RegExp(`\\[\\[ingredient:${escapedId}\\|[^\\]\\r\\n]+\\]\\]`, 'giu');
  const slug = ingredientSlug(ingredientName);
  if (!slug) {
    throw new Error('Ingredient names must produce a readable mention.');
  }
  return markdown.replace(targetPattern, `#${slug}`);
}

export function serializeInstructionSteps(
  steps: readonly InstructionStepDraft[],
  recipeIngredientIds: readonly string[],
): InstructionStepPayload[] {
  const seenStepIds = new Set<string>();
  const validIngredientIds = new Set(recipeIngredientIds.map((id) => id.toLocaleLowerCase()));
  const payload: InstructionStepPayload[] = [];

  for (const step of steps) {
    if (!step.id || seenStepIds.has(step.id)) {
      throw new Error('Instruction step IDs must be unique.');
    }
    seenStepIds.add(step.id);

    const markdown = step.markdown.trim();
    if (!markdown) {
      continue;
    }

    for (const mention of parseIngredientMentions(markdown)) {
      if (!validIngredientIds.has(mention.recipeIngredientId)) {
        throw new Error('Instruction mentions must reference an ingredient row in this recipe.');
      }
    }

    payload.push({
      id: step.id,
      position: payload.length,
      content_markdown: markdown,
      plain_text: step.plainText.trim(),
    });
  }

  return payload;
}
