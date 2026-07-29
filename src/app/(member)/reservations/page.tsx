"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";

type Reservation = { reservationId: string; scheduleId: string; branchName: string; ticketTypeName: string; startsAt: string; instructorName: string; cancelDeadlineAt: string; cancelable: boolean };
type ResponseBody = { upcoming: Reservation[] };
type ApiError = { error?: { message?: string } };
function datetime(value: string) { return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)); }

export default function ReservationsPage() {
  const [items, setItems] = useState<Reservation[]>([]); const [selected, setSelected] = useState<Reservation | null>(null); const [message, setMessage] = useState("");
  async function load() { const response = await fetch("/api/member/reservations"); if (!response.ok) { const body = (await response.json().catch(() => ({}))) as ApiError; setMessage(body.error?.message ?? ""); return; } setItems(((await response.json()) as ResponseBody).upcoming); }
  useEffect(() => {
    let active = true;
    void fetch("/api/member/reservations")
      .then(async (response) => response.ok ? (await response.json()) as ResponseBody : Promise.reject(((await response.json().catch(() => ({}))) as ApiError).error?.message ?? ""))
      .then((body) => { if (active) setItems(body.upcoming); })
      .catch((error: unknown) => { if (active) setMessage(typeof error === "string" ? error : ""); });
    return () => { active = false; };
  }, []);
  async function cancel() { if (!selected) return; const response = await fetch(`/api/member/reservations/${selected.reservationId}`, { method: "DELETE" }); if (!response.ok) { const body = (await response.json().catch(() => ({}))) as ApiError; setMessage(body.error?.message ?? ""); return; } setSelected(null); await load(); }
  return <section className="px-5 pt-6"><h1 className="text-xl font-bold">내 예약</h1>{message && <p className="mt-4 text-sm text-warning">{message}</p>}<div className="mt-5 space-y-3">{items.length === 0 ? <EmptyState message="예정된 예약이 없습니다" /> : items.map((item) => <Card key={item.reservationId} className="p-4"><p className="text-base font-semibold">{datetime(item.startsAt)}</p><p className="mt-2 text-[15px]">{item.ticketTypeName}</p><p className="mt-1 text-[13px] text-muted">{item.branchName} · {item.instructorName} 강사</p><div className="mt-4 flex items-center justify-between border-t border-line pt-3"><span className="text-xs text-muted">무료 취소 {datetime(item.cancelDeadlineAt)}까지</span><button className="text-sm text-warning" onClick={() => setSelected(item)}>예약 취소</button></div></Card>)}</div><Modal isOpen={selected !== null} onClose={() => setSelected(null)}>{selected && <><h2 className="text-center text-[17px] font-semibold">예약을 취소하시겠습니까?</h2><p className="mt-3 rounded-control bg-quiet p-3 text-center text-sm">{datetime(selected.startsAt)}<br />{selected.ticketTypeName} · {selected.branchName}</p><p className="mt-3 text-center text-sm text-muted">{selected.cancelable ? "차감된 횟수 1회가 복구됩니다." : "지금 취소하시면 횟수 1회가 차감되고 복구되지 않습니다."}</p><div className="mt-5 grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setSelected(null)}>닫기</Button><Button variant={selected.cancelable ? "primary" : "danger"} onClick={() => void cancel()}>{selected.cancelable ? "예약 취소" : "차감하고 취소"}</Button></div></>}</Modal></section>;
}
