"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { formatKstAdminDateTime, formatKstTime } from "@/lib/time";

type Member = { id: string; name: string; phone?: string; phoneLast4?: string; remainingCount: number; isCrossBranch: boolean };
type Reservation = { reservationId: string; member: Member; status: "RESERVED" | "CANCELED" | "LATE_CANCELED" | "ATTENDED" | "NO_SHOW" | "CLASS_CANCELED"; source: "MEMBER" | "PROXY"; createdAt: string };
type Waitlist = { waitlistId: string; sequence: number; status: "WAITING" | "OFFERED"; member: Member };
type Detail = { id: string; branchName: string; ticketTypeName: string; instructorName: string; startsAt: string; endsAt: string; capacity: number; reservedCount: number; status: "SCHEDULED" | "CLOSED" | "CANCELED"; isPast: boolean; closeDecisionDeadlineAt: string; reservations: Reservation[]; waitlist: Waitlist[] };
type Action = "INSTRUCTOR" | "CLOSE" | "CANCEL" | null;
type ApiError = { error?: { message?: string } };

function statusLabel(status: Reservation["status"]) {
  return ({ RESERVED: "예약", CANCELED: "취소", LATE_CANCELED: "지각 취소", ATTENDED: "출석", NO_SHOW: "노쇼", CLASS_CANCELED: "수업 취소" })[status];
}

export default function AdminScheduleDetailPage() {
  const params = useParams<{ id: string }>();
  const scheduleId = params.id;
  const [data, setData] = useState<Detail | null>(null);
  const [message, setMessage] = useState("");
  const [choices, setChoices] = useState<Record<string, "ATTENDED" | "NO_SHOW">>({});
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState("");
  const [instructorName, setInstructorName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [closePreview, setClosePreview] = useState<{ reservations: number; waitlist: number; restoredCount: number } | null>(null);

  async function load() {
    const response = await fetch(`/api/admin/schedules/${scheduleId}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      return;
    }
    const detail = (await response.json()) as Detail;
    setData(detail);
    setInstructorName(detail.instructorName);
  }

  useEffect(() => {
    if (!scheduleId) return;
    let active = true;
    void fetch(`/api/admin/schedules/${scheduleId}`)
      .then(async (response) => response.ok ? (await response.json()) as Detail : Promise.reject(((await response.json().catch(() => ({}))) as ApiError).error?.message ?? ""))
      .then((detail) => { if (active) { setData(detail); setInstructorName(detail.instructorName); } })
      .catch((error: unknown) => { if (active) setMessage(typeof error === "string" ? error : ""); });
    return () => { active = false; };
  }, [scheduleId]);

  const selectedReservations = useMemo(() => Object.entries(choices).filter(([, choice]) => choice), [choices]);

  async function request(path: string, init?: RequestInit) {
    setSubmitting(true);
    setMessage("");
    const response = await fetch(path, init);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      setSubmitting(false);
      return false;
    }
    setSubmitting(false);
    return true;
  }

  async function processAttendance() {
    const attended = selectedReservations.filter(([, choice]) => choice === "ATTENDED").map(([id]) => id);
    const noShow = selectedReservations.filter(([, choice]) => choice === "NO_SHOW").map(([id]) => id);
    if (attended.length + noShow.length === 0) return;
    if (await request(`/api/admin/schedules/${scheduleId}/attendance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ attended, noShow }) })) {
      setChoices({});
      await load();
    }
  }

  async function cancelReservation(reservationId: string) {
    if (await request(`/api/admin/reservations/${reservationId}`, { method: "DELETE" })) await load();
  }

  async function revertReservation(reservationId: string) {
    if (await request(`/api/admin/reservations/${reservationId}/revert`, { method: "POST" })) await load();
  }

  async function openAction(nextAction: Exclude<Action, null>) {
    setAction(nextAction);
    setReason("");
    if (nextAction === "CLOSE") {
      const response = await fetch(`/api/admin/schedules/${scheduleId}/close-preview`);
      if (response.ok) setClosePreview((await response.json()) as { reservations: number; waitlist: number; restoredCount: number });
    }
  }

  async function submitAction() {
    if (!action) return;
    const endpoint = action === "INSTRUCTOR" ? `/api/admin/schedules/${scheduleId}/instructor` : `/api/admin/schedules/${scheduleId}/${action === "CLOSE" ? "close" : "cancel"}`;
    const body = action === "INSTRUCTOR" ? { instructorName } : { reason };
    if (await request(endpoint, { method: action === "INSTRUCTOR" ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })) {
      setAction(null);
      await load();
    }
  }

  if (!data) return <section className="mx-auto max-w-7xl"><Link className="text-[13px] text-accent" href="/admin/schedules">시간표 관리</Link><EmptyState message={message || "수업 정보를 불러오는 중입니다"} /></section>;

  return <section className="mx-auto max-w-7xl"><header className="flex flex-wrap items-start justify-between gap-4"><div><Link className="text-[13px] text-accent" href="/admin/schedules">시간표 관리</Link><h1 className="mt-3 text-[22px] font-bold">수업 상세</h1><p className="mt-1 text-[13px] text-muted">{formatKstAdminDateTime(data.startsAt)} · {formatKstTime(data.startsAt)} - {formatKstTime(data.endsAt)}</p></div><div className="flex flex-wrap gap-2"><Button className="min-h-[38px] text-[12px]" variant="secondary" onClick={() => void openAction("INSTRUCTOR")}>대체 강사 지정</Button><Button className="min-h-[38px] text-[12px]" variant="secondary" onClick={() => void openAction("CANCEL")}>수업 취소</Button><Button className="min-h-[38px] text-[12px]" variant="danger" onClick={() => void openAction("CLOSE")}>폐강 처리</Button></div></header>
    {message && <p className="mt-5 rounded-control border border-warning/30 bg-warning-soft p-3 text-[13px] text-warning">{message}</p>}
    <Card className="mt-6 grid divide-y divide-line md:grid-cols-5 md:divide-x md:divide-y-0"><Info label="지점" value={data.branchName} /><Info label="수업" value={data.ticketTypeName} /><Info label="강사" value={data.instructorName} /><Info label="예약 현황" value={`${data.reservedCount} / ${data.capacity}명`} warn={data.reservedCount === data.capacity} /><Info label="대기" value={`${data.waitlist.length}명`} /></Card>
    <Card className="mt-5 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="text-[15px] font-semibold">예약자 명단</h2><p className="mt-1 text-[12px] text-muted">선택한 예약자를 출석 또는 노쇼로 처리합니다.</p></div><Button className="min-h-[38px] text-[12px]" disabled={selectedReservations.length === 0 || submitting} onClick={() => void processAttendance()}>출석 처리 ({selectedReservations.length})</Button></div><DataTable><thead className="bg-canvas text-[12px] text-muted"><tr><th className="px-4 py-3 text-left">처리</th><th className="px-4 py-3 text-left">회원명</th><th className="px-4 py-3 text-left">연락처</th><th className="px-4 py-3 text-left">남은 횟수</th><th className="px-4 py-3 text-left">예약 경로</th><th className="px-4 py-3 text-left">상태</th><th /></tr></thead><tbody>{data.reservations.map((reservation) => <tr className="border-t border-line text-[13px]" key={reservation.reservationId}><td className="px-4 py-3">{reservation.status === "RESERVED" ? <div className="flex gap-2"><label className="text-[12px]"><input className="mr-1" type="radio" name={reservation.reservationId} checked={choices[reservation.reservationId] === "ATTENDED"} onChange={() => setChoices({ ...choices, [reservation.reservationId]: "ATTENDED" })} />출석</label><label className="text-[12px]"><input className="mr-1" type="radio" name={reservation.reservationId} checked={choices[reservation.reservationId] === "NO_SHOW"} onChange={() => setChoices({ ...choices, [reservation.reservationId]: "NO_SHOW" })} />노쇼</label></div> : "-"}</td><td className="px-4 py-3 font-semibold">{reservation.member.name}</td><td className={`px-4 py-3 ${reservation.member.isCrossBranch ? "text-disabled" : ""}`}>{reservation.member.phone ?? `***-${reservation.member.phoneLast4 ?? ""}`}</td><td className="px-4 py-3">{reservation.member.remainingCount}회</td><td className="px-4 py-3"><Badge tone="neutral">{reservation.source === "PROXY" ? "대리" : "직접"}</Badge></td><td className="px-4 py-3"><Badge tone={reservation.status === "NO_SHOW" ? "warning" : reservation.status === "ATTENDED" || reservation.status === "RESERVED" ? "accent" : "neutral"}>{statusLabel(reservation.status)}</Badge></td><td className="px-4 py-3 text-right">{reservation.status === "RESERVED" && <button className="text-[12px] text-warning" disabled={submitting} onClick={() => void cancelReservation(reservation.reservationId)}>예약 취소</button>}{(reservation.status === "ATTENDED" || reservation.status === "NO_SHOW") && <button className="text-[12px] text-accent" disabled={submitting} onClick={() => void revertReservation(reservation.reservationId)}>되돌리기</button>}</td></tr>)}</tbody></DataTable></Card>
    <Card className="mt-5 overflow-hidden"><div className="flex items-center justify-between p-5"><h2 className="text-[15px] font-semibold">대기자 명단</h2><Badge tone="neutral">{data.waitlist.length}명</Badge></div>{data.waitlist.length === 0 ? <EmptyState message="대기자가 없습니다" /> : <DataTable><thead className="bg-canvas text-[12px] text-muted"><tr><th className="px-4 py-3 text-left">순번</th><th className="px-4 py-3 text-left">회원명</th><th className="px-4 py-3 text-left">연락처</th><th className="px-4 py-3 text-left">남은 횟수</th><th className="px-4 py-3 text-left">상태</th></tr></thead><tbody>{data.waitlist.map((entry) => <tr className="border-t border-line text-[13px]" key={entry.waitlistId}><td className="px-4 py-3">{entry.sequence}</td><td className="px-4 py-3 font-semibold">{entry.member.name}</td><td className={`px-4 py-3 ${entry.member.isCrossBranch ? "text-disabled" : ""}`}>{entry.member.phone ?? `***-${entry.member.phoneLast4 ?? ""}`}</td><td className="px-4 py-3">{entry.member.remainingCount}회</td><td className="px-4 py-3"><Badge tone="neutral">{entry.status === "OFFERED" ? "확정 대기" : "대기 중"}</Badge></td></tr>)}</tbody></DataTable>}</Card>
    <Modal isOpen={action !== null} onClose={() => setAction(null)}>{action && <div><h2 className="text-[17px] font-semibold">{action === "INSTRUCTOR" ? "대체 강사 지정" : action === "CLOSE" ? "이 수업을 폐강 처리하시겠습니까?" : "이 수업을 취소하시겠습니까?"}</h2>{action === "INSTRUCTOR" ? <label className="mt-5 block text-[12px] text-muted">강사<Input className="mt-2 h-[38px]" value={instructorName} onChange={(event) => setInstructorName(event.target.value)} /></label> : <><Card className="mt-5 divide-y divide-line bg-canvas p-4 text-[13px]"><p className="flex justify-between pb-2"><span className="text-muted">예약 취소 처리</span><strong>{action === "CLOSE" ? closePreview?.reservations ?? 0 : data.reservations.filter((item) => item.status === "RESERVED").length}명</strong></p><p className="flex justify-between pt-2"><span className="text-muted">대기 취소 처리</span><strong>{action === "CLOSE" ? closePreview?.waitlist ?? 0 : data.waitlist.length}명</strong></p></Card><label className="mt-4 block text-[12px] text-muted">{action === "CLOSE" ? "폐강 사유" : "취소 사유"}<Input className="mt-2 h-[38px]" value={reason} onChange={(event) => setReason(event.target.value)} /></label></>}<div className="mt-6 grid grid-cols-2 gap-2"><Button className="min-h-[38px] text-[13px]" variant="secondary" onClick={() => setAction(null)}>취소</Button><Button className="min-h-[38px] text-[13px]" variant={action === "CLOSE" || action === "CANCEL" ? "danger" : "primary"} disabled={submitting} onClick={() => void submitAction()}>{action === "INSTRUCTOR" ? "변경하기" : action === "CLOSE" ? "폐강 처리" : "수업 취소"}</Button></div></div>}</Modal>
  </section>;
}

function Info({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return <div className="p-5"><p className="text-[12px] text-muted">{label}</p><p className={`mt-2 text-[15px] font-semibold ${warn ? "text-warning" : ""}`}>{value}</p></div>;
}
