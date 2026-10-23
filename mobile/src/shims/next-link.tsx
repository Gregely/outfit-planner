import type { AnchorHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { navigate } from "../runtime/router-store";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | null;
  ref?: Ref<HTMLAnchorElement>;
  children?: ReactNode;
};

function toHref(href: Props["href"]) {
  if (typeof href === "string") return href;
  const qs = href.query ? `?${new URLSearchParams(href.query)}` : "";
  return `${href.pathname ?? ""}${qs}`;
}

/** In-app navigation without reloading the WebView. Downloads (`/api/...`) are handled elsewhere. */
export default function Link({ href, replace, scroll, prefetch, onClick, ...rest }: Props) {
  void prefetch; // everything is local – nothing to prefetch
  const url = toHref(href);
  return (
    <a
      {...rest}
      href={url}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (rest.target || rest.download !== undefined || url.startsWith("/api/") || /^[a-z]+:/i.test(url)) return;
        e.preventDefault();
        void navigate(url, { replace, scroll });
      }}
    />
  );
}
(Link as unknown as Record<symbol, boolean>)[Symbol.for("wardrobe.client")] = true;
