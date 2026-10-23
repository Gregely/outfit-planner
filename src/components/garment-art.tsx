/* eslint-disable @next/next/no-img-element -- local SVG illustrations and user photos are served by our own API */
"use client";

import { useEffect, useMemo, useState } from "react";
import { platform } from "@/lib/platform";
import { renderGarmentSvg, type IllustrationInput } from "@/lib/illustration/render";
import { cx } from "./ui";

/**
 * `/api/...` image URLs as-is on the web; on Android the app resolves them to a local URL
 * (an inline SVG or a file in app storage), since there's no HTTP server to serve them.
 */
function useAssetUrl(path: string): string | undefined {
  const resolve = platform()?.assetUrl;
  const immediate = resolve ? resolve(path) : path;
  const [async, setAsync] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    if (typeof immediate === "string") return;
    let live = true;
    immediate.then((url) => live && setAsync((prev) => (prev?.path === path && prev.url === url ? prev : { path, url })), () => {});
    return () => {
      live = false;
    };
  }, [immediate, path]);
  if (typeof immediate === "string") return immediate;
  return async?.path === path ? async.url || undefined : undefined;
}

/** Cached illustration, loaded as an image (browser-cached by version key). */
export function GarmentArt({
  garment,
  className,
}: {
  garment: { id: number; name: string; illustrationKey: string | null };
  className?: string;
}) {
  const src = useAssetUrl(`/api/garments/${garment.id}/illustration?v=${encodeURIComponent(garment.illustrationKey ?? "0")}`);
  return (
    <img
      src={src}
      alt={garment.name}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cx("h-full w-full object-contain select-none", className)}
    />
  );
}

/**
 * Inline drawing rendered from attributes – used for live previews while editing and
 * for history entries whose garment has since been deleted. The renderer sanitises
 * every value, so the markup is safe to inline.
 */
export function InlineArt({ input, className, label }: { input: IllustrationInput; className?: string; label?: string }) {
  const svg = useMemo(() => renderGarmentSvg(input, { label }), [input, label]);
  return <span role="img" aria-label={label ?? input.name ?? "garment"} className={cx("block [&>svg]:h-full [&>svg]:w-full", className)} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function GarmentPhoto({ file, alt, className }: { file: string; alt: string; className?: string }) {
  const src = useAssetUrl(`/api/photos/${encodeURIComponent(file)}`);
  return <img src={src} alt={alt} loading="lazy" className={cx("h-full w-full object-cover", className)} />;
}
