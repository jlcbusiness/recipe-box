import { type Extensions, Node } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { ingredientSlug } from './instruction-rules';

export type InstructionInlineToken =
  | { type: 'text'; value: string }
  | { type: 'strong'; value: string }
  | { type: 'emphasis'; value: string }
  | { type: 'strike'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; label: string; url: string }
  | { type: 'mention'; id: string; slug: string };

export type InstructionMarkdownBlock =
  | { type: 'paragraph'; content: InstructionInlineToken[] }
  | { type: 'heading'; level: number; content: InstructionInlineToken[] }
  | { type: 'list'; ordered: boolean; items: InstructionInlineToken[][] };

const inlineTokenPattern =
  /(\[\[ingredient:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\|([^\]\r\n]+)\]\])|(\[([^\]\r\n]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\))|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*]+\*|_[^_]+_)|(~~[^~]+~~)|(`+[^`]+`+)/giu;

function parseInstructionInline(value: string): InstructionInlineToken[] {
  const tokens: InstructionInlineToken[] = [];
  let previousIndex = 0;

  for (const match of value.matchAll(inlineTokenPattern)) {
    const fullMatch = match[0];
    const index = match.index ?? 0;
    if (index > previousIndex) {
      tokens.push({ type: 'text', value: value.slice(previousIndex, index) });
    }

    if (match[2] && match[3]) {
      tokens.push({ type: 'mention', id: match[2].toLocaleLowerCase(), slug: match[3] });
    } else if (match[5] && match[6]) {
      tokens.push({ type: 'link', label: match[5], url: match[6] });
    } else if (match[8]) {
      tokens.push({ type: 'strong', value: match[8].slice(2, -2) });
    } else if (match[9]) {
      tokens.push({ type: 'emphasis', value: match[9].slice(1, -1) });
    } else if (match[10]) {
      tokens.push({ type: 'strike', value: match[10].slice(2, -2) });
    } else if (match[11]) {
      const fence = match[11].match(/^`+/u)?.[0] ?? '`';
      tokens.push({ type: 'code', value: match[11].slice(fence.length, -fence.length) });
    }
    previousIndex = index + fullMatch.length;
  }

  if (previousIndex < value.length) {
    tokens.push({ type: 'text', value: value.slice(previousIndex) });
  }
  return tokens;
}

export function parseInstructionMarkdown(markdown: string): InstructionMarkdownBlock[] {
  const blocks: InstructionMarkdownBlock[] = [];
  const source = markdown.replace(/\r\n?/gu, '\n').trim();
  if (!source) {
    return blocks;
  }

  for (const block of source.split(/\n\s*\n/gu)) {
    const lines = block.split('\n');
    const heading = /^(#{1,6})\s+(.+)$/u.exec(lines[0] ?? '');
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1]?.length ?? 1,
        content: parseInstructionInline(heading[2] ?? ''),
      });
      continue;
    }

    const firstListItem = /^\s*(?:(\d+)[.)]|[-+*])\s+(.+)$/u.exec(lines[0] ?? '');
    if (firstListItem) {
      const ordered = Boolean(firstListItem[1]);
      const items = lines.flatMap((line) => {
        const item = /^\s*(?:(\d+)[.)]|[-+*])\s+(.+)$/u.exec(line);
        return item ? [parseInstructionInline(item[2] ?? '')] : [];
      });
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    blocks.push({
      type: 'paragraph',
      content: parseInstructionInline(lines.map((line) => line.trim()).join(' ')),
    });
  }

  return blocks;
}

export function getSafeInstructionHref(href: string): string | null {
  const value = href.trim();
  if (/^(?:https?:\/\/|mailto:)/iu.test(value)) {
    return value;
  }
  if (/^(?:\/|\.{1,2}\/|[?#])/u.test(value)) {
    return value.startsWith('//') ? null : value;
  }
  if (value.startsWith('\\') || /^[a-z][a-z\d+.-]*:/iu.test(value)) {
    return null;
  }

  try {
    const url = new URL(`https://${value}`);
    if (url.hostname.includes('.') || url.hostname === 'localhost') {
      return url.toString();
    }
  } catch {
    return null;
  }

  return value;
}

export type InstructionIngredient = {
  id: string;
  name: string;
};

type InstructionExtensionOptions = {
  displayMode: 'editor' | 'reader';
  ingredients: readonly InstructionIngredient[];
};

export function createInstructionExtensions({
  displayMode,
  ingredients,
}: InstructionExtensionOptions): Extensions {
  const ingredientsById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));

  const IngredientMention = Node.create({
    name: 'ingredientMention',
    inline: true,
    group: 'inline',
    atom: true,
    addAttributes() {
      return {
        id: { default: null },
        label: { default: '' },
      };
    },
    markdownTokenizer: {
      name: 'ingredientMention',
      level: 'inline',
      start: (source) => source.indexOf('[[ingredient:'),
      tokenize(source) {
        const match =
          /^\[\[ingredient:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\|([^\]\r\n]+)\]\]/iu.exec(
            source,
          );
        if (!match) {
          return undefined;
        }

        return {
          type: 'ingredientMention',
          raw: match[0],
          id: match[1]?.toLocaleLowerCase(),
          label: match[2],
        };
      },
    },
    parseMarkdown(token, helpers) {
      return helpers.createNode(this.name, {
        id: token.id,
        label: token.label,
      });
    },
    renderMarkdown(node) {
      const id = node.attrs?.id as string | null | undefined;
      const fallbackLabel = node.attrs?.label as string | undefined;
      if (!id) {
        return fallbackLabel ? `#${fallbackLabel}` : '';
      }

      const ingredient = ingredientsById.get(id);
      const label = ingredient ? ingredientSlug(ingredient.name) : (fallbackLabel ?? '');
      return `[[ingredient:${id}|${label}]]`;
    },
    renderHTML({ node }) {
      const ingredient = ingredientsById.get(node.attrs.id);
      const label = ingredient ? ingredientSlug(ingredient.name) : node.attrs.label;
      const text = displayMode === 'editor' ? `#${label}` : (ingredient?.name ?? `#${label}`);
      return [
        'span',
        {
          class: 'ingredient-mention',
          'data-ingredient-id': node.attrs.id,
        },
        text,
      ];
    },
    renderText({ node }) {
      const ingredient = ingredientsById.get(node.attrs.id);
      const label = ingredient ? ingredientSlug(ingredient.name) : node.attrs.label;
      return displayMode === 'editor' ? `#${label}` : (ingredient?.name ?? `#${label}`);
    },
  });

  return [StarterKit, Markdown, IngredientMention];
}
