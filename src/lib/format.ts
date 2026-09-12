function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayLabel(date: Date): string {
  const diff = Math.round(
    (startOfDay(date) - startOfDay(new Date())) / 86400000
  );
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function timeLabel(date: Date): string {
  return date
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .replace(':00', '');
}

export function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function groupByDay<T>(items: T[], getDate: (item: T) => Date) {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const key = startOfDay(getDate(item));
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, group]) => ({ date: new Date(key), items: group }));
}
