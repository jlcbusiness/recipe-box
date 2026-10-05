export type InstructionStepDraft = {
  id: string;
  markdown: string;
  plainText: string;
};

export type InstructionMention = {
  recipeIngredientId: string;
  slug: string;
};

export type InstructionStepPayload = {
  id: string;
  position: number;
  content_markdown: string;
  plain_text: string;
};

const mentionPattern =
  /\[\[ingredient:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\|([^\]\r\n]+)\]\]/giu;
const mentionPrefixPattern = /\[\[ingredient:/giu;

export function ingredientSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

export function instructionPlainText(markdown: string): string {
  return markdown
    .replace(mentionPattern, (_marker, _id: string, slug: string) => `#${slug}`)
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

  return matches.map((match) => ({
    recipeIngredientId: (match[1] ?? '').toLocaleLowerCase(),
    slug: match[2] ?? '',
  }));
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
