"use client";

import Link from "next/link";
import { use } from "react";
import type { PublicCase } from "@/lib/cases";
import { CasePanel } from "../../components/CasePanel";
import { TopBar, usePoll } from "../../components/ui";

export default function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = usePoll<{ case: PublicCase }>(`/api/cases/${id}`, 2000);
  return (
    <div className="shell">
      <TopBar />
      <main className="page">
        <Link href="/" className="small muted">Back to the board</Link>
        <div style={{ marginTop: 14 }}>
          {data?.case ? (
            <CasePanel c={data.case} />
          ) : error ? (
            <p className="muted">This case doesn't exist or was cleared from the board.</p>
          ) : (
            <p className="faint">Loading case…</p>
          )}
        </div>
      </main>
    </div>
  );
}
