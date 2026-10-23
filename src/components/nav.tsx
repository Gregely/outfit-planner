"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CalendarIcon, CogIcon, HangerIcon, HomeIcon, MenuDotsIcon, SparkIcon, UserIcon, WashIcon } from "./icons";
import { cx } from "./ui";

const ITEMS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/wardrobe", label: "Wardrobe", icon: HangerIcon },
  { href: "/outfits", label: "Outfits", icon: SparkIcon },
  { href: "/planner", label: "Planner", icon: CalendarIcon },
  { href: "/laundry", label: "Laundry", icon: WashIcon },
  { href: "/profile", label: "Style profile", icon: UserIcon },
  { href: "/settings", label: "Settings", icon: CogIcon },
];

/** On phones the first four are tabs; the rest live behind "More". */
const PRIMARY = ITEMS.slice(0, 4);
const SECONDARY = ITEMS.slice(4);

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function Nav() {
  return <NavLinks path={usePathname()} />;
}

/** Rendered without an active item while the current URL is resolved. */
export function NavLinks({ path }: { path: string }) {
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-card/70 px-4 py-6 backdrop-blur md:flex">
        <Link href="/" className="mb-8 px-2">
          <span className="block font-serif text-2xl leading-none font-medium tracking-tight">Wardrobe</span>
          <span className="block font-serif text-2xl leading-none font-medium tracking-tight text-accent italic">Studio</span>
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(path, href) ? "page" : undefined}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                isActive(path, href) ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep",
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <p className="mt-auto px-3 text-[0.7rem] leading-relaxed text-muted">A personal fashion journal. Your data stays on this computer.</p>
      </aside>
      <MobileNav path={path} />
    </>
  );
}

function MobileNav({ path }: { path: string }) {
  const [more, setMore] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const moreActive = SECONDARY.some((i) => isActive(path, i.href));
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMore(false);
    const onDown = (e: PointerEvent) => {
      if (!sheet.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[data-more-toggle]")) setMore(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [more]);
  const tab = "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[0.68rem]";
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur md:hidden">
      {more ? (
        <div ref={sheet} id="more-menu" className="absolute inset-x-2 bottom-full mb-2 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
          {SECONDARY.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMore(false)}
              aria-current={isActive(path, href) ? "page" : undefined}
              className={cx("flex min-h-12 items-center gap-3 border-b border-line px-4 text-sm last:border-b-0", isActive(path, href) ? "text-accent" : "text-ink")}
            >
              <Icon size={19} />
              {label}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="mx-auto flex max-w-lg px-1 pb-[env(safe-area-inset-bottom)]">
        {PRIMARY.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={() => setMore(false)} aria-current={isActive(path, href) ? "page" : undefined} className={cx(tab, isActive(path, href) ? "text-accent" : "text-muted")}>
            <Icon size={21} />
            <span className="max-w-full truncate">{label}</span>
          </Link>
        ))}
        <button
          type="button"
          data-more-toggle
          aria-expanded={more}
          aria-controls="more-menu"
          onClick={() => setMore((m) => !m)}
          className={cx(tab, more || moreActive ? "text-accent" : "text-muted")}
        >
          <MenuDotsIcon size={21} />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
