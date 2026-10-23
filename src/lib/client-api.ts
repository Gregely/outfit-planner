/** Browser-side JSON API helper with consistent error messages. */
import { platform } from "./platform";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const init: RequestInit = { method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET") };
  if (opts.form) init.body = opts.form;
  else if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { "content-type": "application/json" };
  }
  let res: Response;
  const local = platform()?.localFetch;
  try {
    res = local ? await local(path, init) : await fetch(path, init);
  } catch (err) {
    if (local) throw new ApiError(0, `Something went wrong inside the app: ${err instanceof Error ? err.message : String(err)}`);
    throw new ApiError(0, "Can't reach the Wardrobe Studio server. Is it still running?");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; issues?: { path: string; message: string }[] };
    const issues = d.issues ?? [];
    const detail = issues.length ? ` ${issues.map((i) => `${i.path ? `${i.path}: ` : ""}${i.message}`).join("; ")}` : "";
    throw new ApiError(res.status, `${d.error ?? `Request failed (${res.status}).`}${detail}`, issues);
  }
  return data as T;
}

export function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
