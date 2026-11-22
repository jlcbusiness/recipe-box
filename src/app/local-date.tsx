'use client';

import { useEffect, useState } from 'react';

export function LocalDate({ value }: { value: string }) {
  const [timeZone, setTimeZone] = useState('UTC');

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        timeZone,
        year: 'numeric',
      }).format(new Date(value))}
    </time>
  );
}
