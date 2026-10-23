import { NextResponse, type NextRequest } from "next/server";

/**
 * Wardrobe Studio is a single-user local app without accounts, so the API only answers
 * requests addressed to this machine (blocks DNS-rebinding) and refuses cross-site
 * writes (blocks other websites posting to it from your browser).
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostname(host: string | null) {
  if (!host) return "";
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
}

export function proxy(request: NextRequest) {
  const extra = (process.env.ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const host = request.headers.get("host");
  const name = hostname(host).toLowerCase();
  if (!LOCAL_HOSTS.has(name) && !extra.includes(name)) {
    return NextResponse.json({ error: "Host not allowed. Add it to ALLOWED_HOSTS to use the app from another device." }, { status: 403 });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    if (site === "cross-site" || (origin && origin !== "null" && new URL(origin).host !== host)) {
      return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
