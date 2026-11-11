const timeFields = [
  ['prepMinutes', 'Prep'],
  ['mixingMinutes', 'Mixing'],
  ['marinateMinutes', 'Marinate'],
  ['chillMinutes', 'Chill'],
  ['freezeMinutes', 'Freeze'],
  ['cookMinutes', 'Cook'],
  ['bakeMinutes', 'Bake'],
  ['coolingMinutes', 'Cooling'],
  ['restMinutes', 'Rest'],
];

export function buildSyntheticRecipeTimeEntries(times, picklists) {
  const entries = [];
  const addEntry = (timeType, minutes) => {
    const timeTypeId = picklists.get(`time_type:${timeType}`);
    if (!timeTypeId) {
      throw new Error(`Local account is missing the time_type option "${timeType}".`);
    }
    entries.push({ time_type_id: timeTypeId, minutes, position: entries.length });
  };

  if (
    times.totalMinutes !== null &&
    (!Number.isSafeInteger(times.totalMinutes) || times.totalMinutes < 0)
  ) {
    throw new Error('The synthetic recipe total time is invalid.');
  }

  for (const [field, timeType] of timeFields) {
    const minutes = times[field];
    if (minutes === null) continue;
    if (!Number.isSafeInteger(minutes) || minutes < 0) {
      throw new Error(`The synthetic recipe ${timeType} time is invalid.`);
    }
    addEntry(timeType, minutes);
  }

  if (entries.length === 0 && times.totalMinutes > 0) {
    addEntry('Cook', times.totalMinutes);
  }

  return entries;
}

export function sameSyntheticRecipeTimeEntries(existing, requested) {
  return (
    existing.length === requested.length &&
    existing.every(
      (entry, index) =>
        entry.time_type_id === requested[index].time_type_id &&
        Number(entry.minutes) === requested[index].minutes &&
        Number(entry.position) === requested[index].position,
    )
  );
}
