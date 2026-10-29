export function pointerSegments(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/") || /~(?:[^01]|$)/.test(pointer)) throw new Error("Invalid RFC 6901 pointer");
  return pointer.slice(1).split("/").map(s => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}
export function pointerEscape(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
export function readPointer(value: unknown, pointer: string): { found: boolean; value?: unknown } {
  let current: any = value;
  for (const segment of pointerSegments(pointer)) {
    if (current === null || typeof current !== "object" ||
      (Array.isArray(current) && !/^(0|[1-9][0-9]*)$/.test(segment)) ||
      !Object.prototype.hasOwnProperty.call(current, segment)) return { found: false };
    current = current[segment];
  }
  return { found: true, value: current };
}
export function writePointer(root: Record<string, unknown>, pointer: string, value: unknown, inputSchema: import('./schema/types').JsonSchema): void {
  const parts = pointerSegments(pointer);
  if (!parts.length) throw new Error("Assignments must name an input field");
  let cursor: any = root;
  let schema: any = inputSchema;
  parts.forEach((part, i) => {
    if (Array.isArray(cursor) && (!/^(0|[1-9][0-9]*)$/.test(part) || Number(part) > 10000)) throw new Error("Unsupported array assignment index");
    const childSchema = Array.isArray(cursor) ? schema?.items :
      Object.prototype.hasOwnProperty.call(schema?.properties ?? {}, part) ? schema.properties[part] : undefined;
    if (i === parts.length - 1) { Object.defineProperty(cursor, part, { value, enumerable: true, writable: true, configurable: true }); return; }
    if (!Object.prototype.hasOwnProperty.call(cursor, part)) {
      const types = Array.isArray(childSchema?.type) ? childSchema.type : [childSchema?.type];
      if (!types.includes("array") && !types.includes("object")) throw new Error("Assignment requires a declared container schema");
      Object.defineProperty(cursor, part, { value: types.includes("array") ? [] : Object.create(null), enumerable: true, writable: true, configurable: true });
    }
    cursor = cursor[part];
    schema = childSchema;
  });
}
export function pointersOverlap(a: string, b: string): boolean {
  return a === b || a.startsWith(b + "/") || b.startsWith(a + "/");
}
