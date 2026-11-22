function localDateKey(value: Date | string, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isSameLocalCalendarDay(
  first: Date | string,
  second: Date | string,
  timeZone: string,
): boolean {
  return localDateKey(first, timeZone) === localDateKey(second, timeZone);
}

export function nextLocalDayBoundary(now: Date, timeZone: string): Date {
  const currentDate = localDateKey(now, timeZone);
  let lower = now.getTime();
  let upper = lower + 60 * 60 * 1000;

  while (localDateKey(new Date(upper), timeZone) === currentDate) {
    upper += 60 * 60 * 1000;
  }

  while (upper - lower > 1) {
    const midpoint = lower + Math.floor((upper - lower) / 2);
    if (localDateKey(new Date(midpoint), timeZone) === currentDate) {
      lower = midpoint;
    } else {
      upper = midpoint;
    }
  }

  return new Date(upper);
}

export function formatLocalDateTime(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}
