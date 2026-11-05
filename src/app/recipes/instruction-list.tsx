import type { ReactNode } from 'react';
import type {
  InstructionInlineToken,
  InstructionMarkdownList,
} from '../../lib/recipes/instruction-markdown';

export function InstructionList({
  list,
  prefix,
  renderInline,
}: {
  list: InstructionMarkdownList;
  prefix: string;
  renderInline: (tokens: InstructionInlineToken[], prefix: string) => ReactNode;
}) {
  const List = list.ordered ? 'ol' : 'ul';
  const occurrences = new Map<string, number>();
  return (
    <List>
      {list.items.map((item) => {
        const signature = JSON.stringify(item);
        const occurrence = occurrences.get(signature) ?? 0;
        occurrences.set(signature, occurrence + 1);
        const key = `${prefix}-${signature}-${occurrence}`;
        const childOccurrences = new Map<string, number>();
        return (
          <li
            className={
              item.content.some((token) => token.type === 'photo')
                ? 'recipe-instruction-with-photo'
                : undefined
            }
            key={key}
          >
            {renderInline(item.content, key)}
            {item.children.map((child) => {
              const identity = JSON.stringify(child);
              const childOccurrence = childOccurrences.get(identity) ?? 0;
              childOccurrences.set(identity, childOccurrence + 1);
              const childKey = `${key}-list-${identity}-${childOccurrence}`;
              return (
                <InstructionList
                  key={childKey}
                  list={child}
                  prefix={childKey}
                  renderInline={renderInline}
                />
              );
            })}
          </li>
        );
      })}
    </List>
  );
}
