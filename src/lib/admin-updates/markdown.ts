import MarkdownIt from 'markdown-it';
import { createElement, Fragment, type ReactNode } from 'react';

type MarkdownToken = ReturnType<InstanceType<typeof MarkdownIt>['parse']>[number];
type MarkdownTokenNode = { token: MarkdownToken; children: MarkdownTokenNode[] };

export function getSafeAdminUpdateHref(href: string): string | null {
  const value = href.trim();
  const hasUnsafeCharacter = Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return /\s/u.test(character) || codePoint <= 0x20 || codePoint === 0x7f || character === '\\';
  });
  if (!value || hasUnsafeCharacter) {
    return null;
  }
  if (/^https?:\/\//iu.test(value) || /^mailto:/iu.test(value)) {
    return value;
  }
  if (
    /^(?:\/|\.{1,2}\/|[?#])/u.test(value) &&
    !value.startsWith('//') &&
    !value.startsWith('/\\')
  ) {
    return value;
  }
  return null;
}

const markdown = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: false,
  typographer: false,
});
markdown.validateLink = (href) => getSafeAdminUpdateHref(href) !== null;

function nestTokens(tokens: MarkdownToken[]): MarkdownTokenNode[] {
  const root: MarkdownTokenNode[] = [];
  const parents: MarkdownTokenNode[] = [];

  for (const token of tokens) {
    const siblings = parents.at(-1)?.children ?? root;
    if (token.nesting === 1) {
      if (token.hidden) {
        continue;
      }
      const node = { token, children: [] };
      siblings.push(node);
      parents.push(node);
    } else if (token.nesting === -1) {
      if (!token.hidden) {
        parents.pop();
      }
    } else {
      siblings.push({ token, children: [] });
    }
  }

  return root;
}

const allowedTags = new Set([
  'a',
  'blockquote',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'ol',
  'p',
  's',
  'strong',
  'ul',
]);

function renderTokenNode(node: MarkdownTokenNode, key: string): ReactNode {
  const { token } = node;
  const children = node.children.map((child, index) => renderTokenNode(child, `${key}-${index}`));

  if (token.type === 'inline') {
    const inlineChildren = nestTokens(token.children ?? []).map((child, index) =>
      renderTokenNode(child, `${key}-${index}`),
    );
    return createElement(Fragment, { key }, inlineChildren);
  }
  if (token.type === 'fence' || token.type === 'code_block') {
    const language = /^[\w-]+$/u.test(token.info.trim()) ? token.info.trim() : '';
    return createElement(
      'pre',
      { key },
      createElement('code', language ? { className: `language-${language}` } : null, token.content),
    );
  }
  if (token.type === 'hr') {
    return createElement('hr', { key });
  }
  if (token.type === 'text' || token.type === 'html_inline' || token.type === 'html_block') {
    return token.content;
  }
  if (token.type === 'image') {
    return token.content;
  }
  if (token.type === 'code_inline') {
    return createElement('code', { key }, token.content);
  }
  if (token.type === 'softbreak') {
    return ' ';
  }
  if (token.type === 'hardbreak') {
    return createElement('br', { key });
  }
  if (token.nesting !== 1 || !allowedTags.has(token.tag)) {
    return children;
  }

  const attributes: Record<string, string | number> = {};
  if (token.tag === 'a') {
    const safeHref = getSafeAdminUpdateHref(token.attrGet('href') ?? '');
    if (!safeHref) {
      return children;
    }
    attributes.href = safeHref;
  } else if (token.tag === 'ol') {
    const start = token.attrGet('start');
    if (start && /^[1-9]\d*$/u.test(start)) {
      attributes.start = Number(start);
    }
  }

  return createElement(token.tag, { ...attributes, key }, children);
}

export function renderAdminUpdateMarkdown(value: string): ReactNode[] {
  const tokens = markdown.parse(value, {});
  return nestTokens(tokens).map((node, index) => renderTokenNode(node, `admin-update-${index}`));
}
