"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type Waitlist = { id: string; sequence: number; status: "WAITING" | "OFFERED"; expiresAt: string | null };
type Schedule = {
  id: string; branchName: string; ticketTypeName: string; instructorName: string; startsAt: string; endsAt: string;
  capacity: number; reservedCount: number; waitingCount: number;
  cardState: "AVAILABLE" | "FULL" | "RESERVED" | "WAITING" | "BLOCKED" | "CLOSED";
  blockedReason: string | null; blockedMessage: string | null; cancelDeadlineAt: string; myWaitlist: Waitlist | null;
};
type Detail = Schedule & { deductCount: number; myTicket: { remainingCount: number; expiresAt: string; weeklyLimit: number | null; weeklyUsed: number } | null };
type ApiError = { error?: { message?: string } };

function time(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

async function errorMessage(response: Response) {
  const body = (await response.json().catch(() => ({}))) as ApiError;
  return body.error?.message ?? "";
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/member/schedules");
    if (!response.ok) {
      setMessage(await errorMessage(response));
      setLoading(false);
      return;
    }
    const body = (await response.json()) as { schedules: Schedule[] };
    setSchedules(body.schedules);
    setLoading(false);
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
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setSelected((await response.json()) as Detail);
  }

  async function reserve() {
    if (!selected) return;
    const response = await fetch("/api/member/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scheduleId: selected.id }),
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setSelected(null);
    await load();
  }

  async function joinWaitlist() {
    if (!selected) return;
    const response = await fetch("/api/member/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scheduleId: selected.id }),
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setSelected(null);
    await load();
  }

  async function cancelWaitlist() {
    if (!selected?.myWaitlist) return;
    const response = await fetch(`/api/member/waitlist/${selected.myWaitlist.id}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setSelected(null);
    await load();
  }

  function cardLabel(schedule: Schedule) {
    if (schedule.cardState === "AVAILABLE") return `여유 ${schedule.capacity - schedule.reservedCount}/${schedule.capacity}`;
    if (schedule.cardState === "FULL") return `대기 ${schedule.waitingCount}명`;
    if (schedule.cardState === "WAITING") return `대기 ${schedule.myWaitlist?.sequence ?? ""}번`;
    if (schedule.cardState === "RESERVED") return "예약완료";
    if (schedule.cardState === "CLOSED") return "종료";
    return "예약불가";
  }

  return <section className="px-5 pt-6">
    <header>
      <h1 className="text-xl font-bold">시간표</h1>
      <p className="mt-2 text-[13px] text-muted">예약 가능한 수업을 확인해 보세요.</p>
    </header>
    {message && <p className="mt-4 rounded-control border border-warning/30 bg-warning-soft p-3 text-sm text-warning">{message}</p>}
    <div className="mt-5 space-y-3">
      {loading ? <EmptyState message="시간표를 불러오는 중입니다" /> : schedules.length === 0 ? <EmptyState message="등록된 수업이 없습니다" /> : schedules.map((schedule) => {
        const tone = schedule.cardState === "AVAILABLE" || schedule.cardState === "WAITING" ? "accent" : schedule.cardState === "FULL" ? "warning" : "neutral";
        return <button key={schedule.id} className="w-full text-left" onClick={() => void openSchedule(schedule.id)}>
          <Card className="p-4">
            <div className="flex items-start justify-between gap-3"><p className="text-[15px] font-semibold">{time(schedule.startsAt)} - {time(schedule.endsAt)}</p><Badge tone={tone}>{cardLabel(schedule)}</Badge></div>
            <p className="mt-2 text-[17px] font-semibold">{schedule.ticketTypeName}</p>
            <p className="mt-1 text-[13px] text-muted">{schedule.branchName} · {schedule.instructorName} 강사</p>
            {schedule.blockedMessage && <p className="mt-2 text-xs text-disabled">{schedule.blockedMessage}</p>}
          </Card>
        </button>;
      })}
    </div>
    <BottomSheet isOpen={selected !== null} onClose={() => setSelected(null)}>
      {selected && <div>
        <Badge tone={selected.cardState === "FULL" ? "warning" : "accent"}>{selected.ticketTypeName}</Badge>
        <h2 className="mt-2 text-xl font-bold">{dateTime(selected.startsAt)}</h2>
        <p className="mt-2 text-sm text-muted">{selected.branchName} · {selected.instructorName} 강사</p>
        <Card className="mt-6 divide-y divide-line p-4 text-sm">
          <div className="flex justify-between pb-3"><span className="text-muted">예약 현황</span><strong>{selected.reservedCount} / {selected.capacity}명</strong></div>
          <div className="flex justify-between py-3"><span className="text-muted">현재 대기 인원</span><strong>{selected.waitingCount}명</strong></div>
          <div className="flex justify-between pt-3"><span className="text-muted">차감 횟수</span><strong>{selected.deductCount}회</strong></div>
        </Card>
        {selected.cardState === "FULL" && <Card className="mt-4 bg-accent-soft p-4 text-sm text-accent"><p className="font-semibold">대기 등록 시 횟수가 먼저 차감됩니다</p><p className="mt-2 text-muted">자리를 받지 못하면 자동으로 반환되며, 대기 취소는 언제든 가능합니다.</p></Card>}
        {selected.myWaitlist && <Card className="mt-4 bg-quiet p-4 text-sm"><p className="font-semibold">대기 {selected.myWaitlist.sequence}번</p><p className="mt-1 text-muted">횟수 1회가 선차감된 상태입니다.</p></Card>}
        {selected.myTicket && selected.cardState === "AVAILABLE" && <p className="mt-4 text-sm text-muted">예약 후 잔여 횟수: {selected.myTicket.remainingCount - 1}회</p>}
        {selected.cardState === "AVAILABLE" && <Button className="mt-6 w-full" onClick={() => void reserve()}>예약하기</Button>}
        {selected.cardState === "FULL" && <Button className="mt-6 w-full" onClick={() => void joinWaitlist()}>대기 등록하기</Button>}
        {selected.cardState === "WAITING" && selected.myWaitlist?.status === "WAITING" && <Button className="mt-6 w-full" variant="danger" onClick={() => void cancelWaitlist()}>대기 취소</Button>}
        {selected.cardState === "WAITING" && selected.myWaitlist?.status === "OFFERED" && <Button className="mt-6 w-full" onClick={() => { window.location.href = `/waitlist/${selected.myWaitlist?.id}`; }}>대기 자리 확인</Button>}
      </div>}
    </BottomSheet>
  </section>;
}
