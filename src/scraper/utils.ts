/**
 * Recursively extracts every `screen_name` value from X's deeply nested
 * GraphQL response objects. Handles arbitrary nesting depth.
 */
export function isRecord(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}

export function extractScreenNames(obj: unknown): string[] {
  const names: string[] = [];

  if (obj === null || obj === undefined) return names;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      names.push(...extractScreenNames(item));
    }
    return names;
  }

  if (isRecord(obj)) {
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (key === 'screen_name' && typeof val === 'string') {
        names.push(val);
      } else {
        names.push(...extractScreenNames(val));
      }
    }
  }

  return names;
}

export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildApiFilter(mode: 'likes' | 'reposts'): string {
  return mode === 'likes' ? '/Favoriters' : '/Retweeters';
}

export function buildTabPath(mode: 'likes' | 'reposts'): string {
  return mode === 'likes' ? '/likes' : '/retweets';
}
