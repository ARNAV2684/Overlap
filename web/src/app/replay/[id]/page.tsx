import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isMatchId } from "@/lib/contracts";
import { MatchById } from "@/components/match/MatchById";

export const metadata: Metadata = { title: "Replay" };

type Props = { params: Promise<{ id: string }> };

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6"><div className="ov-card min-h-[60vh]" /></main>}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: Props) {
  const { id } = await params;
  if (!isMatchId(id)) notFound();
  return <MatchById matchId={id} forceReplay />;
}
