export function safeParseJson<T>(raw: string, fallback: T): T {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) candidates.push(fenced.trim());
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.push(objectMatch[0]);
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) candidates.push(arrayMatch[0]);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // continue
    }
  }
  return fallback;
}

export function truncate(value: string, max = 1600): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}
