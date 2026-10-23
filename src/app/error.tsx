"use client";

import { Button, EmptyState } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState title="Something went wrong" action={<Button onClick={reset}>Try again</Button>}>
      {error.message || "An unexpected error occurred."} Your data is safe – it&apos;s stored locally.
    </EmptyState>
  );
}
