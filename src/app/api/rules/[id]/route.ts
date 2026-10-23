import { z } from "zod";
import { route, readJson, intParam } from "@/server/api";
import { deleteRule, updateRule } from "@/server/services/preferences";
import { dateString } from "@/lib/schemas";

type P = { id: string };

const patch = z.object({ active: z.boolean().optional(), text: z.string().max(500).optional(), permanent: z.boolean().optional(), expiresAt: dateString.nullish() });

export const PATCH = route<P>(async (req, { id }) => ({ rule: updateRule(intParam(id), await readJson(req, patch)) }));
export const DELETE = route<P>((_req, { id }) => {
  deleteRule(intParam(id));
  return { ok: true };
});
