import { route, intParam } from "@/server/api";
import { garmentIllustration, regenerateIllustration } from "@/server/services/garments";

type P = { id: string };

/** The cached SVG, served as an image so the browser caches it and it can't run scripts. */
export const GET = route<P>((req, { id }) => {
  const { svg, key } = garmentIllustration(intParam(id));
  const etag = `"${key}"`;
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag } });
  const versioned = new URL(req.url).searchParams.get("v") === key;
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": versioned ? "private, max-age=31536000, immutable" : "private, no-cache",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
      etag,
    },
  });
});

export const POST = route<P>((_req, { id }) => ({ garment: regenerateIllustration(intParam(id)) }));
