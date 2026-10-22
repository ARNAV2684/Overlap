import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isMatchId } from "@/lib/contracts";
import { RecapView } from "@/components/match/RecapView";

export const metadata: Metadata = { title: "Recap" };

type Props = { params: Promise<{ id: string }> };

export default function RecapPage({ params }: Props) {
  return (
    <Suspense fallback={<main className="mx-auto max-w-[860px] px-4 py-10" />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: Props) {
  const { id } = await params;
  if (!isMatchId(id)) notFound();
  return <RecapView matchId={id} />;
}
