function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function shouldSortStringArray(pathSegments: string[], values: unknown[]): values is string[] {
  const currentKey = pathSegments[pathSegments.length - 1];
  return (currentKey === "aliases" || currentKey === "required") && values.every((value) => typeof value === "string");
}

export function canonicalizeJsonValue(value: unknown, pathSegments: string[] = []): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalizeJsonValue(item, pathSegments));
    return shouldSortStringArray(pathSegments, items) ? [...items].sort(compareText) : items;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => compareText(left, right))
    .map(([key, entryValue]) => [key, canonicalizeJsonValue(entryValue, [...pathSegments, key])]);

  return Object.fromEntries(entries);
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(canonicalizeJsonValue(value), null, 2)}\n`;
}
