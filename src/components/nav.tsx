"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, CogIcon, HangerIcon, HomeIcon, SparkIcon, UserIcon, WashIcon } from "./icons";
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
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-lg px-0.5 pb-[env(safe-area-inset-bottom)]">
          {ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(path, href) ? "page" : undefined}
              className={cx(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-2 text-[0.6rem]",
                isActive(path, href) ? "text-accent" : "text-muted",
              )}
            >
              <Icon size={19} />
              <span className="max-w-full truncate">{label.replace("Style profile", "Profile")}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
