import "server-only";
import { connection, NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { AppError, BadRequestError } from "./errors";

type Ctx<P> = { params: Promise<P> };

/**
 * Wrap a route handler: always runs at request time (the DB is local and live), maps
 * validation and domain errors to JSON responses, and never leaks stack traces.
 */
export function route<P = Record<string, string>>(handler: (req: Request, params: P) => Promise<unknown> | unknown) {
  return async (req: Request, ctx: Ctx<P>) => {
    await connection();
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      const result = await handler(req, params);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Some fields are invalid.", issues: err.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  if (err instanceof AppError) return NextResponse.json({ error: err.message, details: err.details ?? null }, { status: err.status });
  console.error("[api] unexpected error", err);
  return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
}

export async function readJson<T extends z.ZodType>(req: Request, schema: T, opts: { maxBytes?: number } = {}): Promise<z.output<T>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new BadRequestError("Expected a JSON request body.");
  const text = await req.text();
  if (text.length > (opts.maxBytes ?? 1_000_000)) throw new BadRequestError("The request is too large.");
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new BadRequestError("The request body isn't valid JSON.");
  }
  return schema.parse(data);
}

export function intParam(value: string | undefined, what = "id") {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequestError(`Invalid ${what}.`);
  return n;
}
