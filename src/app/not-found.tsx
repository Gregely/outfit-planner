import { ButtonLink, EmptyState } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState title="Not found" action={<ButtonLink href="/">Back home</ButtonLink>}>
      That page, garment or outfit doesn&apos;t exist – it may have been deleted.
    </EmptyState>
  );
}
