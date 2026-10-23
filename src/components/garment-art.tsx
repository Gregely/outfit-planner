/* eslint-disable @next/next/no-img-element -- local SVG illustrations and user photos are served by our own API */
"use client";

import { useMemo } from "react";
import { renderGarmentSvg, type IllustrationInput } from "@/lib/illustration/render";
import { cx } from "./ui";

/** Cached illustration, loaded as an image (browser-cached by version key). */
export function GarmentArt({
  garment,
  className,
}: {
  garment: { id: number; name: string; illustrationKey: string | null };
  className?: string;
}) {
  return (
    <img
      src={`/api/garments/${garment.id}/illustration?v=${encodeURIComponent(garment.illustrationKey ?? "0")}`}
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
  return <img src={`/api/photos/${encodeURIComponent(file)}`} alt={alt} loading="lazy" className={cx("h-full w-full object-cover", className)} />;
}
