import type { Metadata } from "next";
import { MatchList } from "@/components/home/MatchList";

export const metadata: Metadata = { title: "Matches" };

export default function MatchesPage() {
  return <MatchList />;
}
