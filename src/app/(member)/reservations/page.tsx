"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";

type Reservation = { reservationId: string; scheduleId: string; branchName: string; ticketTypeName: string; startsAt: string; instructorName: string; cancelDeadlineAt: string; cancelable: boolean };
type Waitlist = { waitlistId: string; scheduleId: string; sequence: number; status: "WAITING" | "OFFERED"; expiresAt: string | null; remainingSeconds: number | null; branchName: string; ticketTypeName: string; instructorName: string; startsAt: string; holdNotice: string };
type ResponseBody = { upcoming: Reservation[]; waiting: Waitlist[]; past: unknown[] };
type ApiError = { error?: { message?: string } };

function datetime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export default function ReservationsPage() {
  const [data, setData] = useState<ResponseBody>({ upcoming: [], waiting: [], past: [] });
  const [tab, setTab] = useState<"upcoming" | "waiting">("upcoming");
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/member/reservations");
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      return;
    }
    setData((await response.json()) as ResponseBody);
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/member/reservations")
      .then(async (response) => response.ok ? (await response.json()) as ResponseBody : Promise.reject(((await response.json().catch(() => ({}))) as ApiError).error?.message ?? ""))
      .then((body) => { if (active) setData(body); })
      .catch((error: unknown) => { if (active) setMessage(typeof error === "string" ? error : ""); });
    return () => { active = false; };
  }, []);

  async function cancelReservation() {
    if (!selected) return;
    const response = await fetch(`/api/member/reservations/${selected.reservationId}`, { method: "DELETE" });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      return;
    }
    setSelected(null);
    await load();
  }

  async function cancelWaitlist(waitlistId: string) {
    const response = await fetch(`/api/member/waitlist/${waitlistId}`, { method: "DELETE" });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      return;
    }
    await load();
  }

  return <section className="px-5 pt-6">
    <h1 className="text-xl font-bold">내 예약</h1>
    {message && <p className="mt-4 text-sm text-warning">{message}</p>}
    <div className="mt-5 grid grid-cols-2 border-b border-line text-center text-[15px]">
      <button className={`border-b-2 py-3 ${tab === "upcoming" ? "border-accent font-semibold text-ink" : "border-transparent text-muted"}`} onClick={() => setTab("upcoming")}>예정 {data.upcoming.length}</button>
      <button className={`border-b-2 py-3 ${tab === "waiting" ? "border-accent font-semibold text-ink" : "border-transparent text-muted"}`} onClick={() => setTab("waiting")}>대기중 {data.waiting.length}</button>
    </div>
    {tab === "upcoming" && <div className="mt-5 space-y-3">
      {data.upcoming.length === 0 ? <EmptyState message="예정된 예약이 없습니다" /> : data.upcoming.map((item) => <Card key={item.reservationId} className="p-4"><p className="text-base font-semibold">{datetime(item.startsAt)}</p><p className="mt-2 text-[15px]">{item.ticketTypeName}</p><p className="mt-1 text-[13px] text-muted">{item.branchName} · {item.instructorName} 강사</p><div className="mt-4 flex items-center justify-between border-t border-line pt-3"><span className="text-xs text-muted">무료 취소 {datetime(item.cancelDeadlineAt)}까지</span><button className="text-sm text-warning" onClick={() => setSelected(item)}>예약 취소</button></div></Card>)}
    </div>}
    {tab === "waiting" && <div className="mt-5 space-y-3">
      {data.waiting.length === 0 ? <EmptyState message="대기 중인 수업이 없습니다" /> : data.waiting.map((item) => <Card key={item.waitlistId} className="p-4"><div className="flex items-start justify-between gap-3"><p className="text-base font-semibold">{datetime(item.startsAt)}</p><Badge tone={item.status === "OFFERED" ? "warning" : "accent"}>{item.status === "OFFERED" ? "자리 배정" : `대기 ${item.sequence}번`}</Badge></div><p className="mt-2 text-[15px]">{item.ticketTypeName}</p><p className="mt-1 text-[13px] text-muted">{item.branchName} · {item.instructorName} 강사</p>{item.status === "WAITING" ? <><p className="mt-4 rounded-control bg-quiet p-3 text-xs text-muted">{item.holdNotice}</p><button className="mt-3 w-full text-right text-sm text-warning" onClick={() => void cancelWaitlist(item.waitlistId)}>대기 취소</button></> : <Link className="mt-4 block" href={`/waitlist/${item.waitlistId}`}><Button className="w-full">예약 확정하기</Button></Link>}</Card>)}
    </div>}
    <Modal isOpen={selected !== null} onClose={() => setSelected(null)}>{selected && <><h2 className="text-center text-[17px] font-semibold">예약을 취소하시겠습니까?</h2><p className="mt-3 rounded-control bg-quiet p-3 text-center text-sm">{datetime(selected.startsAt)}<br />{selected.ticketTypeName} · {selected.branchName}</p><p className="mt-3 text-center text-sm text-muted">{selected.cancelable ? "차감된 횟수 1회가 복구됩니다." : "지금 취소하시면 횟수 1회가 차감되고 복구되지 않습니다."}</p><div className="mt-5 grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setSelected(null)}>닫기</Button><Button variant={selected.cancelable ? "primary" : "danger"} onClick={() => void cancelReservation()}>{selected.cancelable ? "예약 취소" : "차감하고 취소"}</Button></div></>}</Modal>
  </section>;
}
