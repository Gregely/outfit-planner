"use client";

import { useState } from "react";
import type { Activity } from "@/server/db/schema";
import { DRESS_CODES, DRESS_CODE_LABELS, SETTINGS_KINDS, type DressCode } from "@/lib/domain";
import type { ActivityInput } from "@/lib/schemas";
import { api } from "@/lib/client-api";
import { Badge, Button, Field, Notice } from "./ui";
import { Modal, useMutation } from "./feedback-ui";
import { CloseIcon, PlusIcon, SparkIcon } from "./icons";

export function ActivityList({ date, activities, ai }: { date: string; activities: Activity[]; ai: { enabled: boolean } }) {
  const { run } = useMutation();
  const [adding, setAdding] = useState(false);
  const [describing, setDescribing] = useState(false);
  return (
    <div>
      {activities.length ? (
        <ul className="space-y-1">
          {activities.map((a) => (
            <li key={a.id} className="group flex items-center gap-2 text-sm">
              <span className="w-11 shrink-0 text-xs text-muted tabular-nums">{a.startTime ?? "—"}</span>
              <span className="min-w-0 flex-1 truncate">{a.title}</span>
              {a.dressCode !== "none" ? <Badge>{DRESS_CODE_LABELS[a.dressCode]}</Badge> : null}
              {a.setting !== "indoor" ? <Badge tone="moss">{a.setting}</Badge> : null}
              <button
                type="button"
                aria-label={`Remove ${a.title}`}
                className="text-muted opacity-60 hover:text-danger group-hover:opacity-100"
                onClick={() => run("del", () => api(`/api/activities/${a.id}`, { method: "DELETE" }))}
              >
                <CloseIcon size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">No plans yet.</p>
      )}
      <div className="mt-2 flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
          <PlusIcon size={13} /> Add
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDescribing(true)}>
          <SparkIcon size={13} /> Describe my day
        </Button>
      </div>
      <AddActivityDialog date={date} open={adding} onClose={() => setAdding(false)} />
      <DescribeDayDialog date={date} open={describing} onClose={() => setDescribing(false)} ai={ai} />
    </div>
  );
}

const blank = (date: string): ActivityInput => ({ date, title: "", startTime: null, endTime: null, dressCode: "none", setting: "indoor", notes: null });

function ActivityFields({ value, onChange }: { value: ActivityInput; onChange: (v: ActivityInput) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="What" className="sm:col-span-2">
        <input className="input" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} placeholder="Seminar, dinner with Sam…" />
      </Field>
      <Field label="From">
        <input type="time" className="input" value={value.startTime ?? ""} onChange={(e) => onChange({ ...value, startTime: e.target.value || null })} />
      </Field>
      <Field label="Until">
        <input type="time" className="input" value={value.endTime ?? ""} onChange={(e) => onChange({ ...value, endTime: e.target.value || null })} />
      </Field>
      <Field label="Dress code">
        <select className="input" value={value.dressCode} onChange={(e) => onChange({ ...value, dressCode: e.target.value as DressCode })}>
          {DRESS_CODES.map((d) => (
            <option key={d} value={d}>
              {DRESS_CODE_LABELS[d]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Where">
        <select className="input" value={value.setting} onChange={(e) => onChange({ ...value, setting: e.target.value as ActivityInput["setting"] })}>
          {SETTINGS_KINDS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Notes" className="sm:col-span-2">
        <input className="input" value={value.notes ?? ""} onChange={(e) => onChange({ ...value, notes: e.target.value || null })} />
      </Field>
    </div>
  );
}

function AddActivityDialog({ date, open, onClose }: { date: string; open: boolean; onClose: () => void }) {
  const [v, setV] = useState<ActivityInput>(blank(date));
  const { run, pending } = useMutation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add an activity"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!v.title.trim()}
            busy={pending === "add"}
            onClick={async () => {
              const r = await run("add", () => api("/api/activities", { body: { ...v, date } }), { success: "Added" });
              if (r) {
                setV(blank(date));
                onClose();
              }
            }}
          >
            Add
          </Button>
        </>
      }
    >
      <ActivityFields value={v} onChange={setV} />
    </Modal>
  );
}

function DescribeDayDialog({ date, open, onClose, ai }: { date: string; open: boolean; onClose: () => void; ai: { enabled: boolean } }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<{ activities: ActivityInput[]; notice: string | null; method: string } | null>(null);
  const { run, pending } = useMutation();
  const close = () => {
    setParsed(null);
    setText("");
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title="Describe your day"
      wide
      footer={
        parsed ? (
          <>
            <Button onClick={() => setParsed(null)}>Back</Button>
            <Button
              variant="primary"
              disabled={!parsed.activities.length || parsed.activities.some((a) => !a.title.trim())}
              busy={pending === "save"}
              onClick={async () => {
                const r = await run("save", () => api("/api/activities/bulk", { body: { activities: parsed.activities } }), { success: `Added ${parsed.activities.length} activities` });
                if (r) close();
              }}
            >
              Add {parsed.activities.length} to the day
            </Button>
          </>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!text.trim()}
              busy={pending === "parse"}
              onClick={() =>
                run(
                  "parse",
                  async () => {
                    const r = await api<{ activities: ActivityInput[]; notice: string | null; method: string }>("/api/activities/parse", { body: { text, date } });
                    setParsed(r);
                    return r;
                  },
                  { refresh: false },
                )
              }
            >
              Read it
            </Button>
          </>
        )
      }
    >
      {!parsed ? (
        <Field label="Your plans" hint={ai.enabled ? "Claude turns this into activities you can check before adding." : "The offline parser picks out times and places – check the result before adding."}>
          <textarea
            className="input min-h-28 font-serif"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Lecture 9–11, library in the afternoon, then dinner with friends at 7 – it's somewhere a bit nice."
          />
        </Field>
      ) : (
        <div className="space-y-4">
          {parsed.notice ? <Notice tone="info">{parsed.notice}</Notice> : null}
          {parsed.activities.length === 0 ? <Notice tone="warning">No activities found.</Notice> : null}
          {parsed.activities.map((a, i) => (
            <div key={i} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex justify-end">
                <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => setParsed({ ...parsed, activities: parsed.activities.filter((_, j) => j !== i) })}>
                  Remove
                </button>
              </div>
              <ActivityFields value={a} onChange={(v) => setParsed({ ...parsed, activities: parsed.activities.map((x, j) => (j === i ? v : x)) })} />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
