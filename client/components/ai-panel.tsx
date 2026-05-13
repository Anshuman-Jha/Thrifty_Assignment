"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Mail,
  MessageSquare,
  RefreshCw,
  Sparkles,
  ListChecks,
  Scale,
} from "lucide-react";

type ArtifactRow = {
  artifact_type: string;
  data: Record<string, unknown>;
  source_content_hash: string;
  stale: boolean;
  updated_at: string;
};

const tabs = [
  { id: "summary", label: "Summary", icon: MessageSquare },
  { id: "action_items", label: "Tasks", icon: ListChecks },
  { id: "decisions", label: "Decisions", icon: Scale },
  { id: "follow_up_email", label: "Email", icon: Mail },
  { id: "ask", label: "Ask", icon: Sparkles },
] as const;

type TabId = (typeof tabs)[number]["id"];

export function AiPanel({ workspaceId }: { workspaceId: string }) {
  const [tab, setTab] = useState<TabId>("summary");
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [askLoading, setAskLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/artifacts`);
      const json = await res.json();
      setArtifacts(json.artifacts ?? []);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const byType = useMemo(() => {
    const m = new Map<string, ArtifactRow>();
    for (const a of artifacts) m.set(a.artifact_type, a);
    return m;
  }, [artifacts]);

  const runAll = async () => {
    setRunning(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/ai/run`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "AI run failed");
        return;
      }
      await load();
    } finally {
      setRunning(false);
    }
  };

  const regenerate = async (artifactType: string) => {
    setRunning(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/ai/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artifact_type: artifactType }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Regenerate failed");
        return;
      }
      await load();
    } finally {
      setRunning(false);
    }
  };

  const patchArtifact = async (artifactType: string, data: unknown) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/artifacts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifact_type: artifactType, data }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Save failed");
      return;
    }
    await load();
  };

  const ask = async () => {
    if (!question.trim()) return;
    setAskLoading(true);
    setAnswer("");
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) {
        const ct = res.headers.get("content-type") ?? "";
        let msg = "Ask failed";
        if (ct.includes("application/json")) {
          const j = await res.json().catch(() => ({}));
          msg = (j as { error?: string }).error ?? msg;
        } else {
          msg = (await res.text()) || msg;
        }
        setAnswer(msg);
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) {
        setAnswer(await res.text());
        return;
      }
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setAnswer(acc);
      }
    } finally {
      setAskLoading(false);
    }
  };

  const summary = byType.get("summary");
  const tasks = byType.get("action_items");
  const decisions = byType.get("decisions");
  const email = byType.get("follow_up_email");

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-2 dark:border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
              tab === t.id
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-600 hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-zinc-800/60"
            }`}
          >
            <t.icon className="size-3.5 opacity-70" />
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={running}
            onClick={() => void runAll()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Run AI
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : tab === "summary" ? (
          <SummaryTab
            row={summary}
            onSave={(data) => void patchArtifact("summary", data)}
            onRegenerate={() => void regenerate("summary")}
            busy={running}
          />
        ) : tab === "action_items" ? (
          <TasksTab
            row={tasks}
            onSave={(data) => void patchArtifact("action_items", data)}
            onRegenerate={() => void regenerate("action_items")}
            busy={running}
          />
        ) : tab === "decisions" ? (
          <DecisionsTab
            row={decisions}
            onSave={(data) => void patchArtifact("decisions", data)}
            onRegenerate={() => void regenerate("decisions")}
            busy={running}
          />
        ) : tab === "follow_up_email" ? (
          <EmailTab
            row={email}
            onSave={(data) => void patchArtifact("follow_up_email", data)}
            onRegenerate={() => void regenerate("follow_up_email")}
            busy={running}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-zinc-500">
              Grounded Q&A over indexed note chunks (rebuilt a few seconds after
              you stop typing).
            </p>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              placeholder="e.g. Who owns onboarding tasks?"
            />
            <button
              type="button"
              disabled={askLoading}
              onClick={() => void ask()}
              className="self-start rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {askLoading ? "Thinking…" : "Ask"}
            </button>
            <pre className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed dark:border-zinc-700 dark:bg-zinc-950">
              {answer || "—"}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function StaleBadge({ stale }: { stale?: boolean }) {
  if (!stale) return null;
  return (
    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-950/80 dark:text-amber-100">
      Stale
    </span>
  );
}

function SummaryTab({
  row,
  onSave,
  onRegenerate,
  busy,
}: {
  row?: ArtifactRow;
  onSave: (data: { text: string }) => void;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const data = (row?.data ?? { text: "" }) as { text?: string };
  const [text, setText] = useState(data.text ?? "");
  useEffect(() => {
    setText(data.text ?? "");
  }, [row?.updated_at]);
  if (!row) {
    return (
      <p className="text-zinc-500">
        No summary yet. Click <strong>Run AI</strong> after you add notes.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <StaleBadge stale={row.stale} />
        <button
          type="button"
          disabled={busy}
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
        >
          <RefreshCw className="size-3.5" />
          Regenerate
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      <button
        type="button"
        onClick={() => onSave({ text })}
        className="self-start rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-600"
      >
        Save edits
      </button>
    </div>
  );
}

type TaskItem = {
  id: string;
  task: string;
  owner: string | null;
  priority: string;
  due_date: string | null;
};

function TasksTab({
  row,
  onSave,
  onRegenerate,
  busy,
}: {
  row?: ArtifactRow;
  onSave: (data: { items: TaskItem[] }) => void;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const data = (row?.data ?? { items: [] }) as { items?: TaskItem[] };
  const [items, setItems] = useState<TaskItem[]>(data.items ?? []);
  useEffect(() => {
    setItems(data.items ?? []);
  }, [row?.updated_at]);

  if (!row) {
    return (
      <p className="text-zinc-500">
        No tasks yet. Run AI after you capture meeting notes.
      </p>
    );
  }

  const update = (i: number, patch: Partial<TaskItem>) => {
    setItems((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <StaleBadge stale={row.stale} />
        <button
          type="button"
          disabled={busy}
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400"
        >
          <RefreshCw className="size-3.5" />
          Regenerate
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="bg-zinc-100 dark:bg-zinc-800/80">
            <tr>
              <th className="p-2 font-medium">Task</th>
              <th className="p-2 font-medium">Owner</th>
              <th className="p-2 font-medium">Priority</th>
              <th className="p-2 font-medium">Due</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="p-1">
                  <input
                    className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-zinc-200 dark:hover:border-zinc-600"
                    value={it.task}
                    onChange={(e) => update(i, { task: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <input
                    className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-zinc-200 dark:hover:border-zinc-600"
                    value={it.owner ?? ""}
                    onChange={(e) =>
                      update(i, { owner: e.target.value || null })
                    }
                  />
                </td>
                <td className="p-1">
                  <input
                    className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-zinc-200 dark:hover:border-zinc-600"
                    value={it.priority}
                    onChange={(e) => update(i, { priority: e.target.value })}
                  />
                </td>
                <td className="p-1">
                  <input
                    className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-zinc-200 dark:hover:border-zinc-600"
                    value={it.due_date ?? ""}
                    onChange={(e) =>
                      update(i, { due_date: e.target.value || null })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => onSave({ items })}
        className="self-start rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-600"
      >
        Save edits
      </button>
    </div>
  );
}

function DecisionsTab({
  row,
  onSave,
  onRegenerate,
  busy,
}: {
  row?: ArtifactRow;
  onSave: (data: { items: string[] }) => void;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const data = (row?.data ?? { items: [] }) as { items?: string[] };
  const [text, setText] = useState((data.items ?? []).join("\n"));
  useEffect(() => {
    setText((data.items ?? []).join("\n"));
  }, [row?.updated_at]);
  if (!row) {
    return <p className="text-zinc-500">No decisions yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <StaleBadge stale={row.stale} />
        <button
          type="button"
          disabled={busy}
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600"
        >
          <RefreshCw className="size-3.5" />
          Regenerate
        </button>
      </div>
      <textarea
        rows={12}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        placeholder="One decision per line"
      />
      <button
        type="button"
        onClick={() =>
          onSave({
            items: text
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        className="self-start rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-600"
      >
        Save edits
      </button>
    </div>
  );
}

function EmailTab({
  row,
  onSave,
  onRegenerate,
  busy,
}: {
  row?: ArtifactRow;
  onSave: (data: { subject: string; body: string }) => void;
  onRegenerate: () => void;
  busy: boolean;
}) {
  const data = (row?.data ?? { subject: "", body: "" }) as {
    subject?: string;
    body?: string;
  };
  const [subject, setSubject] = useState(data.subject ?? "");
  const [body, setBody] = useState(data.body ?? "");
  useEffect(() => {
    setSubject(data.subject ?? "");
    setBody(data.body ?? "");
  }, [row?.updated_at]);
  if (!row) {
    return <p className="text-zinc-500">No draft email yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <StaleBadge stale={row.stale} />
        <button
          type="button"
          disabled={busy}
          onClick={onRegenerate}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600"
        >
          <RefreshCw className="size-3.5" />
          Regenerate
        </button>
      </div>
      <input
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
      />
      <textarea
        rows={12}
        className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button
        type="button"
        onClick={() => onSave({ subject, body })}
        className="self-start rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-600"
      >
        Save edits
      </button>
    </div>
  );
}
