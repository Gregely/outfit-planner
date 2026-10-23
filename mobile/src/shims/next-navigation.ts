import { useSyncExternalStore } from "react";
import { getLocation, navigate, refresh, subscribe, NotFoundSignal, RedirectSignal } from "../runtime/router-store";

export type AppRouter = {
  push(href: string, opts?: { scroll?: boolean }): void;
  replace(href: string, opts?: { scroll?: boolean }): void;
  refresh(): void;
  back(): void;
  forward(): void;
  prefetch(href: string): void;
};

const router: AppRouter = {
  push: (href, opts) => void navigate(href, { scroll: opts?.scroll }),
  replace: (href, opts) => void navigate(href, { replace: true, scroll: opts?.scroll }),
  refresh: () => void refresh(),
  back: () => history.back(),
  forward: () => history.forward(),
  prefetch: () => {},
};

export function useRouter(): AppRouter {
  return router;
}

const useLocation = () => useSyncExternalStore(subscribe, getLocation, getLocation);

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  return useLocation().searchParams;
}

export function useParams(): Record<string, string> {
  return useLocation().params;
}

export function notFound(): never {
  throw new NotFoundSignal();
}

export function redirect(url: string): never {
  throw new RedirectSignal(url);
}

export const permanentRedirect = redirect;
