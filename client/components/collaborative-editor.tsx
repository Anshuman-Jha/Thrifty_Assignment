"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Collaboration } from "@tiptap/extension-collaboration";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import * as Y from "yjs";
import { base64ToUint8, uint8ToBase64 } from "@/lib/binary";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Props = {
  workspaceId: string;
  initialYjsBase64: string;
  onPlainTextChange?: (text: string) => void;
};

export function CollaborativeEditor({
  workspaceId,
  initialYjsBase64,
  onPlainTextChange,
}: Props) {
  const ydoc = useMemo(() => {
    const d = new Y.Doc();
    if (initialYjsBase64) {
      try {
        Y.applyUpdate(d, base64ToUint8(initialYjsBase64), "db");
      } catch {
        /* ignore corrupt snapshot */
      }
    }
    return d;
  }, [workspaceId, initialYjsBase64]);

  const indexTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    async (ed: Editor) => {
      const update = Y.encodeStateAsUpdate(ydoc);
      const b64 = uint8ToBase64(update);
      const plain_text = ed.getText();
      await fetch(`/api/workspaces/${workspaceId}/document`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yjs_state_base64: b64, plain_text }),
      });
      if (indexTimer.current) clearTimeout(indexTimer.current);
      indexTimer.current = setTimeout(() => {
        void fetch(`/api/workspaces/${workspaceId}/index`, { method: "POST" });
      }, 4000);
    },
    [workspaceId, ydoc],
  );

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: false,
      extensions: [
        StarterKit.configure({ history: false }),
        Collaboration.configure({ document: ydoc }),
        Placeholder.configure({
          placeholder:
            "Shared meeting notes — edits sync in real time. Open the AI panel to summarize and extract tasks.",
        }),
      ],
      editorProps: {
        attributes: {
          class:
            "min-h-[58vh] w-full max-w-none px-4 py-3 text-[15px] leading-relaxed outline-none text-zinc-900 dark:text-zinc-100 [&_p]:my-2",
        },
      },
      onUpdate: ({ editor: ed }) => {
        onPlainTextChange?.(ed.getText());
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          void persist(ed);
        }, 900);
      },
    },
    [ydoc, onPlainTextChange, persist],
  );

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const room = `yjs:${workspaceId}`;
    const ch = supabase.channel(room, {
      config: { broadcast: { self: false } },
    });

    ch.on("broadcast", { event: "yjs" }, ({ payload }) => {
      const p = payload as { b64?: string };
      if (!p?.b64) return;
      try {
        Y.applyUpdate(ydoc, base64ToUint8(p.b64), "remote");
      } catch {
        /* ignore */
      }
    });

    ch.subscribe();

    const onDocUpdate = (u: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      void ch.send({
        type: "broadcast",
        event: "yjs",
        payload: { b64: uint8ToBase64(u) },
      });
    };
    ydoc.on("update", onDocUpdate);

    return () => {
      ydoc.off("update", onDocUpdate);
      void supabase.removeChannel(ch);
    };
  }, [workspaceId, ydoc]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (indexTimer.current) clearTimeout(indexTimer.current);
      const ed = editorRef.current;
      if (ed) void persist(ed);
    };
  }, [persist]);

  if (!editor) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40">
        Preparing editor…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <EditorContent editor={editor} />
    </div>
  );
}
