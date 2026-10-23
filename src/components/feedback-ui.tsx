"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/client-api";
import { Button, cx } from "./ui";
import { CloseIcon } from "./icons";

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

type Tone = "info" | "success" | "error" | "warning";
type Toast = { id: number; title: string; body?: ReactNode; tone: Tone; action?: { label: string; onClick: () => void } };
type ToastFn = (t: Omit<Toast, "id" | "tone"> & { tone?: Tone; duration?: number }) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback<ToastFn>(
    ({ duration, tone = "info", ...t }) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-3), { ...t, tone, id }]);
      const ms = duration ?? (tone === "error" ? 9000 : t.action ? 9000 : 4500);
      window.setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );
  const tones: Record<Tone, string> = {
    info: "border-line-strong",
    success: "border-moss/50",
    error: "border-danger/60",
    warning: "border-gold/60",
  };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:right-6 md:bottom-6 md:left-auto md:items-end">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className={cx("card animate-fade-up pointer-events-auto w-full max-w-sm border-l-4 px-4 py-3", tones[t.tone])}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.body ? <div className="mt-0.5 text-xs text-muted">{t.body}</div> : null}
                {t.action ? (
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-accent underline underline-offset-2"
                    onClick={() => {
                      t.action!.onClick();
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                ) : null}
              </div>
              <button type="button" aria-label="Dismiss" className="text-muted hover:text-ink" onClick={() => dismiss(t.id)}>
                <CloseIcon size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  /** set while *we* close the native dialog, so its asynchronous `close` event isn't read as a dismissal */
  const closingProgrammatically = useRef(false);
  // Keep the native <dialog> in sync with `open`. The cleanup closes it when the effect is torn
  // down – unmount, Strict Mode's extra mount cycle, or Next's <Activity> hiding the route – and
  // the next run reopens it, so content and form state survive. Closing here is never a dismissal:
  // only the user (Escape, backdrop, close button) calls onClose.
  useEffect(() => {
    const d = ref.current;
    if (!open || !d) return;
    if (!d.open) d.showModal();
    return () => {
      if (d.open) {
        closingProgrammatically.current = true;
        d.close();
      }
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={() => {
        if (closingProgrammatically.current) {
          closingProgrammatically.current = false;
          return;
        }
        // The browser closed it on its own (e.g. a close request that skipped `cancel`).
        if (open) onClose();
      }}
      onCancel={(e) => {
        // Escape: let React state decide whether the dialog closes.
        e.preventDefault();
        onClose();
      }}
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        // Only a press that starts and ends on the backdrop dismisses (not a text selection drag).
        if (pressedOnBackdrop.current && e.target === ref.current) onClose();
        pressedOnBackdrop.current = false;
      }}
      aria-label={title}
      className={cx(
        "m-auto max-h-[90vh] w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-line bg-card p-0 text-ink shadow-2xl backdrop:bg-ink/35 backdrop:backdrop-blur-[2px]",
        wide ? "max-w-3xl" : "max-w-lg",
      )}
    >
      {open ? (
        <div className="flex max-h-[90vh] flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-lg font-medium">{title}</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1 text-muted hover:bg-paper-deep hover:text-ink">
              <CloseIcon />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-paper/60 px-5 py-3">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Confirm                                                             */
/* ------------------------------------------------------------------ */

type ConfirmOpts = { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean };
const ConfirmContext = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={Boolean(state)}
        onClose={() => close(false)}
        title={state?.title ?? ""}
        footer={
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {state?.confirmLabel ?? "Confirm"}
            </Button>
          </>
        }
      >
        <div className="text-sm text-ink-soft">{state?.body}</div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

/**
 * Run an API call with a pending flag, an error toast on failure and a server refresh on
 * success, so server components re-render with fresh data.
 */
export function useMutation() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(
      key: string,
      fn: () => Promise<T>,
      opts: { success?: string | ((r: T) => string | null); refresh?: boolean } = {},
    ): Promise<T | null> => {
      setPending(key);
      try {
        const result = await fn();
        const msg = typeof opts.success === "function" ? opts.success(result) : opts.success;
        if (msg) toast({ title: msg, tone: "success" });
        if (opts.refresh !== false) router.refresh();
        return result;
      } catch (err) {
        toast({ title: "That didn't work", body: errorMessage(err), tone: "error" });
        return null;
      } finally {
        setPending(null);
      }
    },
    [router, toast],
  );
  return { run, pending, api };
}

export type AffectedPlan = { date: string; outfitId: number; garmentIds: number[]; locked: boolean };

/** Tell the user which planned days a status change affects, without changing them. */
export function useAffectedPlansToast() {
  const toast = useToast();
  const router = useRouter();
  return useCallback(
    (plans: AffectedPlan[] | undefined) => {
      if (!plans?.length) return;
      const days = plans.map((p) => new Date(`${p.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }));
      toast({
        tone: "warning",
        title: `This affects ${plans.length === 1 ? "a planned outfit" : `${plans.length} planned outfits`}`,
        body: `${days.join(", ")} – those plans are flagged so you can pick a replacement. Nothing was changed automatically.`,
        action: { label: "Review in planner", onClick: () => router.push(`/planner?start=${plans[0].date}`) },
      });
    },
    [toast, router],
  );
}
