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
  | { type: 'duration'; value: string }
  | { type: 'temperature'; value: string }
  | { type: 'photo'; id: string; width?: number }
  | { type: 'link'; label: string; url: string }
  | { type: 'mention'; id: string; slug: string; portionOrdinal?: 1 | 2 };

export type TemperatureSystem = 'fahrenheit' | 'celsius';

export type InstructionMarkdownBlock =
  | { type: 'paragraph'; content: InstructionInlineToken[] }
  | { type: 'heading'; level: number; content: InstructionInlineToken[] }
  | { type: 'list'; ordered: boolean; items: InstructionInlineToken[][] };

const inlineTokenPattern =
  /(\[\[ingredient:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?::[12])?\|([^\]\r\n]+)\]\])|(\[([^\]\r\n]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\))|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*]+\*|_[^_]+_)|(~~[^~]+~~)|(`+[^`]+`+)|(\[\[duration:([^\]\r\n]+)\]\])|(?<![\p{L}\p{N}_])([FC])!(\d+(?:\.\d+)?)\b|(?<![\p{L}\p{N}_])!(?:[\p{L}\p{M}](?:[\p{L}\p{M} -]*[\p{L}\p{M}])?)!(?![\p{L}\p{N}_])|(\[\[photo:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\]\](?:-[1-9]\d{0,3})?)|((?<![\\=])=([^\s=\r\n](?:[^=\r\n]*[^\s=\r\n])?)(?<!\\)=(?![=]))/giu;

function formatTemperature(
  value: string,
  sourceUnit: string,
  temperatureSystem?: TemperatureSystem,
) {
  const normalizedSourceUnit = sourceUnit.toLocaleUpperCase();
  const authoredValue = Number(value);
  const targetUnit =
    temperatureSystem === undefined
      ? normalizedSourceUnit
      : temperatureSystem === 'fahrenheit'
        ? 'F'
        : 'C';
  const displayValue =
    normalizedSourceUnit === targetUnit
      ? authoredValue
      : targetUnit === 'C'
        ? ((authoredValue - 32) * 5) / 9
        : (authoredValue * 9) / 5 + 32;
  return `${Math.round(displayValue / 5) * 5}°${targetUnit}`;
}

function parseInstructionInline(
  value: string,
  temperatureSystem?: TemperatureSystem,
): InstructionInlineToken[] {
  const tokens: InstructionInlineToken[] = [];
  let previousIndex = 0;

  for (const match of value.matchAll(inlineTokenPattern)) {
    const fullMatch = match[0];
    const index = match.index ?? 0;
    if (index > previousIndex) {
      tokens.push({ type: 'text', value: value.slice(previousIndex, index) });
    }

    if (match[2] && match[3]) {
      const legacyPortion = /^([12])\|(.+)$/u.exec(match[3]);
      const explicitPortionOrdinal =
        /^\[\[ingredient:[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}:([12])\|/iu.exec(
          fullMatch,
        )?.[1];
      const portionOrdinal = explicitPortionOrdinal
        ? (Number(explicitPortionOrdinal) as 1 | 2)
        : legacyPortion
          ? (Number(legacyPortion[1]) as 1 | 2)
          : undefined;
      tokens.push({
        type: 'mention',
        id: match[2].toLocaleLowerCase(),
        slug: legacyPortion?.[2] ?? match[3],
        ...(portionOrdinal === undefined ? {} : { portionOrdinal }),
      });
    } else if (match[12] && match[13]) {
      tokens.push({ type: 'duration', value: match[13] });
    } else if (match[14] && match[15]) {
      tokens.push({
        type: 'temperature',
        value: formatTemperature(match[15], match[14], temperatureSystem),
      });
    } else if (fullMatch.startsWith('!')) {
      tokens.push({ type: 'temperature', value: fullMatch.slice(1, -1) });
    } else if (match[16] && match[17]) {
      const width = /-([1-9]\d{0,3})$/u.exec(match[16])?.[1];
      tokens.push({
        type: 'photo',
        id: match[17].toLocaleLowerCase(),
        ...(width === undefined ? {} : { width: Number(width) }),
      });
    } else if (match[18] && match[19]) {
      tokens.push({ type: 'duration', value: match[19] });
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

export function parseInstructionMarkdown(
  markdown: string,
  temperatureSystem?: TemperatureSystem,
): InstructionMarkdownBlock[] {
  const blocks: InstructionMarkdownBlock[] = [];
  const source = markdown.replace(/\r\n?/gu, '\n').trim();
  if (!source) {
    return blocks;
  }

  for (const block of source.split(/\n\s*\n/gu)) {
    const lines = block.split('\n');
    let paragraphLines: string[] = [];
    let pendingList: { ordered: boolean; items: InstructionInlineToken[][] } | null = null;

    const flushParagraph = () => {
      if (paragraphLines.length > 0) {
        blocks.push({
          type: 'paragraph',
          content: parseInstructionInline(paragraphLines.join(' '), temperatureSystem),
        });
        paragraphLines = [];
      }
    };

    const flushList = () => {
      if (pendingList && pendingList.items.length > 0) {
        blocks.push({
          type: 'list',
          ordered: pendingList.ordered,
          items: pendingList.items,
        });
        pendingList = null;
      }
    };

    for (const rawLine of lines) {
      const heading = /^(#{1,6})\s+(.+)$/u.exec(rawLine);
      if (heading) {
        flushParagraph();
        flushList();
        blocks.push({
          type: 'heading',
          level: heading[1]?.length ?? 1,
          content: parseInstructionInline(heading[2] ?? '', temperatureSystem),
        });
        continue;
      }

      const listItem = /^\s*(?:(\d+)[.)]|([-+*]))\s+(.+)$/u.exec(rawLine);
      if (listItem) {
        flushParagraph();
        const ordered = Boolean(listItem[1]);
        if (pendingList && pendingList.ordered !== ordered) {
          flushList();
        }
        if (!pendingList) {
          pendingList = { ordered, items: [] };
        }
        pendingList.items.push(parseInstructionInline(listItem[3] ?? '', temperatureSystem));
        continue;
      }

      const trimmed = rawLine.trim();
      if (trimmed) {
        flushList();
        paragraphLines.push(trimmed);
      }
    }

    flushParagraph();
    flushList();
  }

  return blocks;
}

export function continueInstructionListOnEnter(
  markdown: string,
  selectionStart: number,
  selectionEnd: number,
): { markdown: string; caret: number } | null {
  const lineStart = selectionStart > 0 ? markdown.lastIndexOf('\n', selectionStart - 1) + 1 : 0;
  const lineBeforeCaret = markdown.slice(lineStart, selectionStart);
  const lineEndIndex = markdown.indexOf('\n', selectionEnd);
  const lineAfterCaret = markdown.slice(
    selectionEnd,
    lineEndIndex === -1 ? markdown.length : lineEndIndex,
  );
  const listMatch = /^(\s*)(?:(\d+)([.)])|([-+*]))\s+(.*)$/u.exec(lineBeforeCaret);
  if (!listMatch) {
    return null;
  }

  const indent = listMatch[1] ?? '';
  const numberText = listMatch[2];
  const orderedDelimiter = listMatch[3] ?? '.';
  const bullet = listMatch[4] ?? '-';
  const itemBeforeCaret = listMatch[5] ?? '';

  if (itemBeforeCaret.trim() === '' && lineAfterCaret.trim() === '') {
    return {
      markdown: `${markdown.slice(0, lineStart)}${markdown.slice(selectionEnd)}`,
      caret: lineStart,
    };
  }

  const nextMarker = numberText
    ? `${indent}${Number.parseInt(numberText, 10) + 1}${orderedDelimiter} `
    : `${indent}${bullet} `;
  const insertion = `\n${nextMarker}`;
  return {
    markdown: `${markdown.slice(0, selectionStart)}${insertion}${markdown.slice(selectionEnd)}`,
    caret: selectionStart + insertion.length,
  };
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
        portionOrdinal: { default: null },
      };
    },
    markdownTokenizer: {
      name: 'ingredientMention',
      level: 'inline',
      start: (source) => source.indexOf('[[ingredient:'),
      tokenize(source) {
        const match =
          /^\[\[ingredient:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?::([12]))?\|([^\]\r\n]+)\]\]/iu.exec(
            source,
          );
        if (!match) {
          return undefined;
        }

        const legacyPortion = /^([12])\|(.+)$/u.exec(match[3] ?? '');

        return {
          type: 'ingredientMention',
          raw: match[0],
          id: match[1]?.toLocaleLowerCase(),
          label: legacyPortion?.[2] ?? match[3],
          portionOrdinal: match[2] ?? legacyPortion?.[1] ?? null,
        };
      },
    },
    parseMarkdown(token, helpers) {
      return helpers.createNode(this.name, {
        id: token.id,
        label: token.label,
        portionOrdinal: token.portionOrdinal,
      });
    },
    renderMarkdown(node) {
      const id = node.attrs?.id as string | null | undefined;
      const fallbackLabel = node.attrs?.label as string | undefined;
      const portionOrdinal = node.attrs?.portionOrdinal as '1' | '2' | null | undefined;
      if (!id) {
        return fallbackLabel ? `#${fallbackLabel}` : '';
      }

      const ingredient = ingredientsById.get(id);
      const label = ingredient ? ingredientSlug(ingredient.name) : (fallbackLabel ?? '');
      const portion = portionOrdinal ? `:${portionOrdinal}` : '';
      return `[[ingredient:${id}${portion}|${label}]]`;
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
