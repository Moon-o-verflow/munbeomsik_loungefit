"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Offer = {
  waitlistId: string;
  status: "WAITING" | "OFFERED";
  expiresAt: string | null;
  remainingSeconds: number | null;
  schedule: { branchName: string; ticketTypeName: string; instructorName: string; startsAt: string; endsAt: string };
};

function clock(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export default function WaitlistOfferScreen({ waitlistId }: { waitlistId: string }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/member/waitlist/${waitlistId}/offer`, { cache: "no-store" });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      setMessage(body.error?.message ?? "");
      return;
    }
    setOffer((await response.json()) as Offer);
  }, [waitlistId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 10_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [load]);

  async function confirm() {
    setConfirming(true);
    const response = await fetch(`/api/member/waitlist/${waitlistId}/confirm`, { method: "POST" });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      setMessage(body.error?.message ?? "");
      setConfirming(false);
      return;
    }
    window.location.href = "/reservations";
  }

  if (message) return <section className="px-5 pt-6"><h1 className="text-base font-semibold">대기 자리 확정</h1><Card className="mt-6 border-warning/30 bg-warning-soft p-5 text-center text-sm text-warning">{message}<a className="mt-5 block text-accent" href="/schedules">시간표로 돌아가기</a></Card></section>;
  if (!offer) return <section className="px-5 pt-6"><h1 className="text-base font-semibold">대기 자리 확정</h1><p className="mt-8 text-center text-sm text-muted">대기 정보를 불러오는 중입니다.</p></section>;
  if (offer.status !== "OFFERED" || offer.remainingSeconds === null) return <section className="px-5 pt-6"><h1 className="text-base font-semibold">대기 자리 확정</h1><Card className="mt-6 p-5 text-center text-sm text-muted">아직 대기 순번이 아닙니다.</Card></section>;

  return <section className="min-h-screen px-5 pt-6">
    <h1 className="text-center text-base font-semibold">대기 자리 확정</h1>
    <div className="mt-6 -mx-5 bg-accent-soft px-5 py-8 text-center text-accent"><p className="text-[13px]">확정까지 남은 시간</p><p className="mt-2 text-5xl font-bold tabular-nums">{clock(offer.remainingSeconds)}</p></div>
    <Card className="mt-5 p-5"><p className="text-xl font-bold">{dateTime(offer.schedule.startsAt)}</p><p className="mt-3 text-[15px]">{offer.schedule.ticketTypeName}</p><p className="mt-1 text-sm text-muted">{offer.schedule.branchName} · {offer.schedule.instructorName} 강사</p><div className="mt-5 border-t border-line pt-4 text-sm"><div className="flex justify-between"><span className="text-muted">차감 횟수</span><strong>1회 (이미 선차감됨)</strong></div></div></Card>
    <Card className="mt-4 bg-quiet p-4 text-center text-xs text-muted">시간 내에 확정하지 않으시면 순번이 다음 대기자에게 넘어가며, 선차감된 횟수 1회는 자동으로 반환됩니다.</Card>
    <div className="mt-6"><Button className="w-full" disabled={confirming} onClick={() => void confirm()}>{confirming ? "확정 중" : "예약 확정하기"}</Button><a className="mt-3 block text-center text-sm text-disabled" href="/reservations">나중에 하기</a></div>
  </section>;
}
