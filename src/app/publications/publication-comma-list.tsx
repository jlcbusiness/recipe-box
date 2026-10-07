export function PublicationCommaList({
  values,
  itemClassName,
}: {
  values: string[];
  itemClassName?: string;
}) {
  if (values.length === 0) {
    return '—';
  }

  const occurrences = new Map<string, number>();

  return (
    <span className="publication-comma-values">
      {values.map((value, index) => {
        const occurrence = occurrences.get(value) ?? 0;
        occurrences.set(value, occurrence + 1);

        return (
          <span className={itemClassName} key={`${value}-${occurrence}`}>
            {value}
            {index < values.length - 1 ? ', ' : ''}
          </span>
        );
      })}
    </span>
  );
}
