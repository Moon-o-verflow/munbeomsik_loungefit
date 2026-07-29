"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { formatKstAdminDateTime, formatKstDate, formatKstInputDate, kstNow } from "@/lib/time";

type Ticket = { id: string; ticketTypeName: string; totalCount: number; remainingCount: number; holdCount: number; expiresAt: string; dailyLimit: number | null; weeklyLimit: number | null; isActive: boolean };
type History = { reservationId: string; startsAt: string; branchName: string; ticketTypeName: string; instructorName: string; source: "MEMBER" | "PROXY"; status: "RESERVED" | "CANCELED" | "LATE_CANCELED" | "ATTENDED" | "NO_SHOW" | "CLASS_CANCELED" };
type Detail = { member: { id: string; name: string; phone: string; branchName: string; createdAt: string }; tickets: Ticket[]; suspension: { isSuspended: boolean; reason: string | null; until: string | null }; noShow: { currentCycleCount: number; threshold: number; cycleStartedAt: string; totalCount: number }; reservationHistory: History[] };
type ApiError = { error?: { message?: string } };

function historyStatus(status: History["status"]) {
  return ({ RESERVED: "예약", CANCELED: "취소", LATE_CANCELED: "지각 취소", ATTENDED: "출석", NO_SHOW: "노쇼", CLASS_CANCELED: "수업 취소" })[status];
}

export default function AdminMemberDetailPage() {
  const params = useParams<{ id: string }>();
  const memberId = params.id;
  const [data, setData] = useState<Detail | null>(null);
  const [message, setMessage] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState(formatKstInputDate(kstNow().add(7, "day")));
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const response = await fetch(`/api/admin/members/${memberId}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      return;
    }
    setData((await response.json()) as Detail);
  }

  useEffect(() => {
    if (!memberId) return;
    let active = true;
    void fetch(`/api/admin/members/${memberId}`)
      .then(async (response) => response.ok ? (await response.json()) as Detail : Promise.reject(((await response.json().catch(() => ({}))) as ApiError).error?.message ?? ""))
      .then((detail) => { if (active) setData(detail); })
      .catch((error: unknown) => { if (active) setMessage(typeof error === "string" ? error : ""); });
    return () => { active = false; };
  }, [memberId]);

  async function toggleSuspension() {
    if (!data) return;
    setSubmitting(true);
    const response = data.suspension.isSuspended ? await fetch(`/api/admin/members/${memberId}/suspend`, { method: "DELETE" }) : await fetch(`/api/admin/members/${memberId}/suspend`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason, until }) });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    setModalOpen(false);
    await load();
  }

  if (!data) return <section className="mx-auto max-w-7xl"><Link className="text-[13px] text-accent" href="/admin/members">회원 관리</Link><EmptyState message={message || "회원 정보를 불러오는 중입니다"} /></section>;

  return <section className="mx-auto max-w-7xl"><header className="flex flex-wrap items-start justify-between gap-4"><div><Link className="text-[13px] text-accent" href="/admin/members">회원 관리</Link><h1 className="mt-3 text-[22px] font-bold">회원 상세</h1><p className="mt-1 text-[13px] text-muted">{data.member.name} · {data.member.phone}</p></div><Button className="min-h-[38px] text-[12px]" variant={data.suspension.isSuspended ? "secondary" : "danger"} onClick={() => data.suspension.isSuspended ? void toggleSuspension() : setModalOpen(true)}>{data.suspension.isSuspended ? "예약 정지 해제" : "예약 정지"}</Button></header>{message && <p className="mt-5 rounded-control border border-warning/30 bg-warning-soft p-3 text-[13px] text-warning">{message}</p>}<div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"><Card className="p-5"><h2 className="text-[15px] font-semibold">회원 정보</h2><dl className="mt-4 grid gap-4 text-[13px] sm:grid-cols-3"><Info label="소속 지점" value={data.member.branchName} /><Info label="가입일" value={formatKstAdminDateTime(data.member.createdAt)} /><Info label="전체 노쇼" value={`${data.noShow.totalCount}회`} /></dl></Card><Card className={`p-5 ${data.suspension.isSuspended ? "border-warning bg-warning-soft" : ""}`}><div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">예약 정지</h2><Badge tone={data.suspension.isSuspended ? "warning" : "accent"}>{data.suspension.isSuspended ? "정지 중" : "정상"}</Badge></div>{data.suspension.isSuspended ? <><p className="mt-3 text-[13px] text-warning">{data.suspension.reason}</p><p className="mt-1 text-[12px] text-muted">~ {data.suspension.until ? formatKstDate(data.suspension.until) : ""}</p></> : <p className="mt-3 text-[13px] text-muted">정지된 예약이 없습니다.</p>}</Card></div><Card className="mt-5 overflow-hidden"><div className="flex items-center justify-between p-5"><h2 className="text-[15px] font-semibold">보유 이용권</h2><span className="text-[12px] text-muted">대기 선차감은 별도로 표시됩니다.</span></div>{data.tickets.length === 0 ? <EmptyState message="보유한 이용권이 없습니다" /> : <DataTable><thead className="bg-canvas text-[12px] text-muted"><tr><th className="px-4 py-3 text-left">이용권</th><th className="px-4 py-3 text-left">총 횟수</th><th className="px-4 py-3 text-left">남은 횟수</th><th className="px-4 py-3 text-left">대기 차감</th><th className="px-4 py-3 text-left">만료일</th><th className="px-4 py-3 text-left">상태</th></tr></thead><tbody>{data.tickets.map((ticket) => <tr className="border-t border-line text-[13px]" key={ticket.id}><td className="px-4 py-4 font-semibold">{ticket.ticketTypeName}</td><td className="px-4 py-4">{ticket.totalCount}회</td><td className="px-4 py-4">{ticket.remainingCount}회</td><td className="px-4 py-4">{ticket.holdCount}회</td><td className="px-4 py-4">{formatKstDate(ticket.expiresAt)}</td><td className="px-4 py-4"><Badge tone={ticket.isActive ? "accent" : "neutral"}>{ticket.isActive ? "사용 중" : "종료"}</Badge></td></tr>)}</tbody></DataTable>}</Card><Card className="mt-5 overflow-hidden"><div className="flex items-center justify-between p-5"><div><h2 className="text-[15px] font-semibold">예약 이력</h2><p className="mt-1 text-[12px] text-muted">이번 주기 노쇼 {data.noShow.currentCycleCount} / {data.noShow.threshold}회</p></div></div>{data.reservationHistory.length === 0 ? <EmptyState message="예약 이력이 없습니다" /> : <DataTable><thead className="bg-canvas text-[12px] text-muted"><tr><th className="px-4 py-3 text-left">일시</th><th className="px-4 py-3 text-left">수업</th><th className="px-4 py-3 text-left">지점</th><th className="px-4 py-3 text-left">예약 경로</th><th className="px-4 py-3 text-left">상태</th></tr></thead><tbody>{data.reservationHistory.map((item) => <tr className="border-t border-line text-[13px]" key={item.reservationId}><td className="px-4 py-4">{formatKstAdminDateTime(item.startsAt)}</td><td className="px-4 py-4">{item.ticketTypeName}</td><td className="px-4 py-4">{item.branchName}</td><td className="px-4 py-4"><Badge tone="neutral">{item.source === "PROXY" ? "대리" : "직접"}</Badge></td><td className="px-4 py-4"><Badge tone={item.status === "NO_SHOW" ? "warning" : item.status === "ATTENDED" ? "accent" : "neutral"}>{historyStatus(item.status)}</Badge></td></tr>)}</tbody></DataTable>}</Card><Modal isOpen={modalOpen} onClose={() => setModalOpen(false)}><h2 className="text-[17px] font-semibold">예약을 정지하시겠습니까?</h2><p className="mt-2 text-[13px] text-muted">기존 예약은 유지되며, 새 예약과 대기 등록만 제한됩니다.</p><label className="mt-5 block text-[12px] text-muted">정지 사유<Input className="mt-2 h-[38px]" value={reason} onChange={(event) => setReason(event.target.value)} /></label><label className="mt-4 block text-[12px] text-muted">정지 종료일<Input className="mt-2 h-[38px]" type="date" value={until} onChange={(event) => setUntil(event.target.value)} /></label><div className="mt-6 grid grid-cols-2 gap-2"><Button className="min-h-[38px] text-[13px]" variant="secondary" onClick={() => setModalOpen(false)}>취소</Button><Button className="min-h-[38px] text-[13px]" variant="danger" disabled={submitting} onClick={() => void toggleSuspension()}>예약 정지</Button></div></Modal></section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[12px] text-muted">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>;
}
