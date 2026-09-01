/** Coarse, human relative dates. Deliberately day-grained: nothing here needs minutes. */
export function relativeDays(value: string | null | undefined): string {
  if (!value) return "unknown";

  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "unknown";

  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "a month ago" : `${months} months ago`;

  const years = Math.floor(days / 365);
  return years === 1 ? "a year ago" : `${years} years ago`;
}
