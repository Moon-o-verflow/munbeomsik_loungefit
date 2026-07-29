"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type Schedule = {
  id: string; branchName: string; ticketTypeName: string; instructorName: string; startsAt: string; endsAt: string;
  capacity: number; reservedCount: number; cardState: "AVAILABLE" | "FULL" | "RESERVED" | "BLOCKED" | "CLOSED"; blockedReason: string | null; blockedMessage: string | null;
  cancelDeadlineAt: string;
};
type Detail = Schedule & { deductCount: number; myTicket: { remainingCount: number; expiresAt: string; weeklyLimit: number | null; weeklyUsed: number } | null };
type ApiError = { error?: { message?: string } };

function time(value: string) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)); }
async function errorMessage(response: Response) { const body = (await response.json().catch(() => ({}))) as ApiError; return body.error?.message ?? ""; }

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/member/schedules");
    if (!response.ok) { setMessage(await errorMessage(response)); setLoading(false); return; }
    const body = (await response.json()) as { schedules: Schedule[] };
    setSchedules(body.schedules); setLoading(false);
  }
  useEffect(() => {
    let active = true;
    void fetch("/api/member/schedules")
      .then(async (response) => response.ok ? (await response.json()) as { schedules: Schedule[] } : Promise.reject(await errorMessage(response)))
      .then((body) => {
        if (!active) return;
        setSchedules(body.schedules);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(typeof error === "string" ? error : "");
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function openSchedule(id: string) {
    const response = await fetch(`/api/member/schedules/${id}`);
    if (!response.ok) { setMessage(await errorMessage(response)); return; }
    setSelected((await response.json()) as Detail);
  }
  async function reserve() {
    if (!selected) return;
    const response = await fetch("/api/member/reservations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scheduleId: selected.id }) });
    if (!response.ok) { setMessage(await errorMessage(response)); return; }
    setSelected(null); await load();
  }

  return <section className="px-5 pt-6">
    <header><h1 className="text-xl font-bold">시간표</h1><p className="mt-2 text-[13px] text-muted">예약 가능한 수업을 확인해 보세요.</p></header>
    {message && <p className="mt-4 rounded-control border border-warning/30 bg-warning-soft p-3 text-sm text-warning">{message}</p>}
    <div className="mt-5 space-y-3">{loading ? <EmptyState message="시간표를 불러오는 중입니다" /> : schedules.length === 0 ? <EmptyState message="등록된 수업이 없습니다" /> : schedules.map((schedule) => {
      const tone = schedule.cardState === "AVAILABLE" ? "accent" : schedule.cardState === "FULL" ? "warning" : "neutral";
      const label = schedule.cardState === "AVAILABLE" ? `여유 ${schedule.capacity - schedule.reservedCount}/${schedule.capacity}` : schedule.cardState === "FULL" ? "마감" : schedule.cardState === "RESERVED" ? "예약완료" : schedule.cardState === "CLOSED" ? "종료" : "예약불가";
      return <button key={schedule.id} className="w-full text-left" onClick={() => void openSchedule(schedule.id)}><Card className="p-4"><div className="flex items-start justify-between gap-3"><p className="text-[15px] font-semibold">{time(schedule.startsAt)} - {time(schedule.endsAt)}</p><Badge tone={tone}>{label}</Badge></div><p className="mt-2 text-[17px] font-semibold">{schedule.ticketTypeName}</p><p className="mt-1 text-[13px] text-muted">{schedule.branchName} · {schedule.instructorName} 강사</p>{schedule.blockedMessage && <p className="mt-2 text-xs text-disabled">{schedule.blockedMessage}</p>}</Card></button>;
    })}</div>
    <BottomSheet isOpen={selected !== null} onClose={() => setSelected(null)}>{selected && <div><Badge tone="accent">{selected.ticketTypeName}</Badge><h2 className="mt-2 text-xl font-bold">{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(selected.startsAt))}</h2><p className="mt-2 text-sm text-muted">{selected.branchName} · {selected.instructorName} 강사</p><Card className="mt-6 divide-y divide-line p-4 text-sm"><div className="flex justify-between pb-3"><span className="text-muted">예약 현황</span><strong>{selected.reservedCount} / {selected.capacity}명</strong></div><div className="flex justify-between py-3"><span className="text-muted">차감 횟수</span><strong>{selected.deductCount}회</strong></div><div className="flex justify-between pt-3"><span className="text-muted">무료 취소 마감</span><strong className="text-warning">{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(selected.cancelDeadlineAt))}</strong></div></Card>{selected.myTicket && <p className="mt-4 text-sm text-muted">예약 후 잔여 횟수: {selected.myTicket.remainingCount - 1}회</p>}<Button className="mt-6 w-full" disabled={selected.cardState !== "AVAILABLE"} onClick={() => void reserve()}>예약하기</Button></div>}</BottomSheet>
  </section>;
}
