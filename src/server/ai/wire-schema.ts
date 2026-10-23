import { z } from "zod";

/**
 * Converts our Zod schemas into JSON Schemas the structured-outputs API accepts, and checks
 * them against its documented limits.
 *
 * Why not the SDK helper: the installed SDK's transform keeps only a whitelist of keywords and
 * moves the rest – including `enum` – into the description text, so enums weren't enforced by
 * constrained decoding. The API does support `enum`, so we keep it.
 *
 * Documented limits (https://platform.claude.com/docs/en/build-with-claude/structured-outputs):
 * at most 24 optional parameters and 16 parameters with union types (`anyOf` or type arrays
 * such as ["string","null"]) per request; numeric and string-length constraints aren't supported.
 */

export type WireSchema = Record<string, unknown>;

export const MAX_OPTIONAL_PARAMS = 24;
export const MAX_UNION_PARAMS = 16;

const SUPPORTED_FORMATS = new Set(["date-time", "time", "date", "duration", "email", "hostname", "uri", "ipv4", "ipv6", "uuid"]);

function strict(node: Record<string, unknown>): WireSchema {
  const out: WireSchema = {};
  if (typeof node.description === "string") out.description = node.description;
  if (Array.isArray(node.anyOf)) {
    out.anyOf = (node.anyOf as Record<string, unknown>[]).map(strict);
    return out;
  }
  if (node.const !== undefined) out.const = node.const;
  if (Array.isArray(node.enum)) out.enum = node.enum;
  const type = node.type;
  if (type !== undefined) out.type = type;
  if (type === "object") {
    const props = (node.properties ?? {}) as Record<string, Record<string, unknown>>;
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, strict(v)]));
    out.required = Array.isArray(node.required) ? node.required : [];
    out.additionalProperties = false;
  } else if (type === "array") {
    if (node.items) out.items = strict(node.items as Record<string, unknown>);
    if (node.minItems === 0 || node.minItems === 1) out.minItems = node.minItems;
  } else if (type === "string") {
    if (typeof node.format === "string" && SUPPORTED_FORMATS.has(node.format)) out.format = node.format;
  }
  // minimum / maximum / minLength / maxLength / pattern are unsupported: they're enforced by Zod
  // after the response arrives, and ranges should be stated in the field's description.
  return out;
}

export function toWireSchema(schema: z.ZodType): WireSchema {
  const json = z.toJSONSchema(schema, { reused: "inline", unrepresentable: "throw" }) as Record<string, unknown>;
  return strict(json);
}

/** Count optional and union-typed parameters across the whole schema. */
export function schemaComplexity(wire: WireSchema) {
  let optional = 0;
  let unions = 0;
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as Record<string, unknown>;
    if (n.type === "object" && n.properties) {
      const required = new Set((n.required as string[]) ?? []);
      for (const [key, prop] of Object.entries(n.properties as Record<string, Record<string, unknown>>)) {
        if (!required.has(key)) optional++;
        if (Array.isArray(prop.anyOf) || Array.isArray(prop.type)) unions++;
      }
    }
    for (const v of Object.values(n)) walk(v);
  };
  walk(wire);
  return { optional, unions };
}

export function describeSchemaLimits(wire: WireSchema) {
  const c = schemaComplexity(wire);
  const problems: string[] = [];
  if (c.unions > MAX_UNION_PARAMS) problems.push(`${c.unions} union-typed parameters (limit ${MAX_UNION_PARAMS})`);
  if (c.optional > MAX_OPTIONAL_PARAMS) problems.push(`${c.optional} optional parameters (limit ${MAX_OPTIONAL_PARAMS})`);
  return { ...c, problems };
}

/**
 * Walk data alongside its wire schema and map enum strings that differ only in letter case,
 * surrounding spaces or "_"/"-"/" " separators to the canonical value.
 */
export function normaliseToSchema(data: unknown, wire: WireSchema): unknown {
  const key = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (Array.isArray(wire.enum) && typeof data === "string") {
    const match = (wire.enum as unknown[]).find((v) => typeof v === "string" && key(v) === key(data));
    return match ?? data;
  }
  if (wire.type === "object" && data && typeof data === "object" && !Array.isArray(data)) {
    const props = (wire.properties ?? {}) as Record<string, WireSchema>;
    return Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([k, v]) => [k, props[k] ? normaliseToSchema(v, props[k]) : v]));
  }
  if (wire.type === "array" && Array.isArray(data) && wire.items) {
    return data.map((v) => normaliseToSchema(v, wire.items as WireSchema));
  }
  return data;
}
