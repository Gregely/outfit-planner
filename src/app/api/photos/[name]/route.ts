import { route } from "@/server/api";
import { readPhotoFile } from "@/server/services/photos";

export const GET = route<{ name: string }>(async (_req, { name }) => {
  const { data, mime } = await readPhotoFile(name);
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": mime,
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'",
    },
  });
});
