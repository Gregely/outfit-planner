"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GarmentView } from "@/server/services/garments";
import type { OutfitView } from "@/server/services/outfits";
import { api } from "@/lib/client-api";
import { platform } from "@/lib/platform";
import { Button, ButtonLink, Notice, Spinner } from "./ui";
import { Modal, useConfirm, useMutation } from "./feedback-ui";
import { CopyIcon, EditIcon, RefreshIcon, SparkIcon, TrashIcon, UploadIcon } from "./icons";
import { OutfitCard } from "./outfit-card";

export function GarmentActions({ garment }: { garment: GarmentView }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { run, pending } = useMutation();
  const file = useRef<HTMLInputElement>(null);
  const [styled, setStyled] = useState<{ outfits: OutfitView[]; notice: string | null } | null>(null);
  const [styling, setStyling] = useState(false);
  // On Android: the system camera and the Photo Picker instead of a file dialog.
  const pickPhoto = platform()?.pickPhoto;
  const upload = async (f: File) => {
    const form = new FormData();
    form.set("photo", f);
    await run("upload", () => api(`/api/garments/${garment.id}/photo`, { form }), { success: "Photo added" });
  };
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button
        variant="primary"
        disabled={!garment.available}
        title={garment.available ? undefined : "Only available garments can be styled"}
        onClick={async () => {
          setStyling(true);
          setStyled(null);
          const res = await run("style", () => api<{ outfits: OutfitView[]; notice: string | null }>("/api/stylist/style-garment", { body: { garmentId: garment.id } }), { refresh: false });
          setStyling(false);
          if (res) setStyled(res);
        }}
      >
        <SparkIcon size={16} /> Style this piece
      </Button>
      <ButtonLink href={`/wardrobe/${garment.id}/edit`}>
        <EditIcon size={15} /> Edit
      </ButtonLink>
      <Button
        busy={pending === "dup"}
        onClick={async () => {
          const res = await run("dup", () => api<{ garment: { id: number } }>(`/api/garments/${garment.id}/duplicate`, { method: "POST" }), { success: "Duplicated", refresh: false });
          if (res) router.push(`/wardrobe/${res.garment.id}/edit`);
        }}
      >
        <CopyIcon size={15} /> Duplicate
      </Button>
      <Button busy={pending === "regen"} onClick={() => run("regen", () => api(`/api/garments/${garment.id}/illustration`, { method: "POST" }), { success: "Illustration redrawn" })}>
        <RefreshIcon size={15} /> Redraw
      </Button>
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label="Upload a photo"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) await upload(f);
        }}
      />
      {pickPhoto ? (
        <>
          <Button busy={pending === "photo"} onClick={() => run("photo", async () => {
            const f = await pickPhoto("camera");
            if (f) await upload(f);
          }, { refresh: false })}>
            <UploadIcon size={15} /> Take photo
          </Button>
          <Button onClick={() => run("photo", async () => {
            const f = await pickPhoto("gallery");
            if (f) await upload(f);
          }, { refresh: false })}>
            From gallery
          </Button>
        </>
      ) : (
        <Button busy={pending === "photo"} onClick={() => file.current?.click()}>
          <UploadIcon size={15} /> {garment.photoFile ? "Replace photo" : "Add photo"}
        </Button>
      )}
      {garment.photoFile ? (
        <Button variant="ghost" onClick={() => run("unphoto", () => api(`/api/garments/${garment.id}/photo`, { method: "DELETE" }), { success: "Photo removed" })}>
          Remove photo
        </Button>
      ) : null}
      <Button
        variant="danger"
        onClick={async () => {
          const ok = await confirm({
            title: `Delete ${garment.name}?`,
            body: "It will be removed from your wardrobe. Past outfits and wear history keep a record of it. This can't be undone.",
            confirmLabel: "Delete",
            danger: true,
          });
          if (!ok) return;
          const res = await run("delete", () => api(`/api/garments/${garment.id}`, { method: "DELETE" }), { success: "Deleted", refresh: false });
          if (res) {
            router.push("/wardrobe");
            router.refresh();
          }
        }}
      >
        <TrashIcon size={15} /> Delete
      </Button>

      <Modal open={styling || Boolean(styled)} onClose={() => setStyled(null)} title={`Ways to wear ${garment.name}`} wide>
        {styling ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Putting outfits together…
          </div>
        ) : null}
        {styled ? (
          <div className="space-y-4">
            {styled.notice ? <Notice tone="info">{styled.notice}</Notice> : null}
            <div className="grid gap-4 md:grid-cols-2">
              {styled.outfits.map((o) => (
                <OutfitCard key={o.id} outfit={o} compact />
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
