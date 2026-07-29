"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatKstAdminDate, formatKstTime } from "@/lib/time";

type TodayClass = { id: string; startsAt: string; ticketTypeName: string; instructorName: string; capacity: number; reservedCount: number; waitingCount: number; attendanceStatus: "NOT_YET" | "PENDING" | "DONE" };
type CloseCandidate = { id: string; startsAt: string; ticketTypeName: string; reservedCount: number; minHeadcount: number; decisionDeadlineAt: string };
type NoShowAlert = { memberId: string; name: string; noShowCount: number; threshold: number; isSuspended: boolean };
type Dashboard = { branchName: string; todayClasses: TodayClass[]; closeCandidates: CloseCandidate[]; noShowAlerts: NoShowAlert[]; pendingAttendanceCount: number };
type ApiError = { error?: { message?: string } };

export default function AdminDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/dashboard");
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      return;
    }
    setData((await response.json()) as Dashboard);
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/dashboard")
      .then(async (response) => response.ok ? (await response.json()) as Dashboard : Promise.reject(((await response.json().catch(() => ({}))) as ApiError).error?.message ?? ""))
      .then((body) => { if (active) setData(body); })
      .catch((error: unknown) => { if (active) setMessage(typeof error === "string" ? error : ""); });
    return () => { active = false; };
  }, []);

  const totalReservations = data?.todayClasses.reduce((total, item) => total + item.reservedCount, 0) ?? 0;
  const totalCapacity = data?.todayClasses.reduce((total, item) => total + item.capacity, 0) ?? 0;

  return (
    <section className="mx-auto max-w-7xl">
      <header className="flex items-start justify-between gap-4">
        <div><h1 className="text-[22px] font-bold">대시보드</h1><p className="mt-1 text-[13px] text-muted">{data?.branchName ?? ""} · {formatKstAdminDate(new Date())}</p></div>
        <button className="h-[38px] rounded-control border border-line bg-surface px-4 text-[12px] text-ink" onClick={() => void load()}>새로고침</button>
      </header>
      {message && <p className="mt-5 rounded-control border border-warning/30 bg-warning-soft p-3 text-[13px] text-warning">{message}</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="오늘 수업" value={String(data?.todayClasses.length ?? 0)} caption={`예약 ${totalReservations} / 정원 ${totalCapacity}`} />
        <SummaryCard label="출석 미처리" value={String(data?.pendingAttendanceCount ?? 0)} warn />
        <SummaryCard label="폐강 검토 대상" value={String(data?.closeCandidates.length ?? 0)} warn />
        <SummaryCard label="노쇼 경계 회원" value={String(data?.noShowAlerts.length ?? 0)} warn />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,62fr)_minmax(280px,38fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-5"><h2 className="text-[15px] font-semibold">오늘의 수업</h2><Link className="text-[12px] text-accent" href="/admin/schedules">시간표 전체보기</Link></div>
          {!data ? <EmptyState message="수업 정보를 불러오는 중입니다" /> : data.todayClasses.length === 0 ? <EmptyState message="오늘 예정된 수업이 없습니다" /> : <DataTable><thead className="bg-canvas text-[12px] text-muted"><tr><th className="px-4 py-3 font-semibold">시간</th><th className="px-4 py-3 font-semibold">수업</th><th className="px-4 py-3 font-semibold">강사</th><th className="px-4 py-3 font-semibold">예약</th><th className="px-4 py-3 font-semibold">대기</th><th className="px-4 py-3 font-semibold">상태</th><th /></tr></thead><tbody>{data.todayClasses.map((item) => <tr className="border-t border-line text-[13px]" key={item.id}><td className="px-4 py-4 font-semibold">{formatKstTime(item.startsAt)}</td><td className="px-4 py-4">{item.ticketTypeName}</td><td className="px-4 py-4">{item.instructorName}</td><td className={`px-4 py-4 font-semibold ${item.reservedCount === item.capacity ? "text-warning" : ""}`}>{item.reservedCount} / {item.capacity}</td><td className="px-4 py-4">{item.waitingCount}</td><td className="px-4 py-4"><Badge tone={item.attendanceStatus === "PENDING" ? "warning" : "neutral"}>{item.attendanceStatus === "PENDING" ? "출석 미처리" : item.attendanceStatus === "DONE" ? "완료" : "예정"}</Badge></td><td className="px-4 py-4 text-right"><Link className="text-[12px] text-accent" href={`/admin/schedules/${item.id}`}>상세</Link></td></tr>)}</tbody></DataTable>}
        </Card>
        <div className="space-y-5">
          <Card className="p-5"><div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">폐강 검토 대상</h2><Badge tone="warning">{data?.closeCandidates.length ?? 0}건</Badge></div>{!data ? <EmptyState message="불러오는 중입니다" /> : data.closeCandidates.length === 0 ? <EmptyState message="검토가 필요한 수업이 없습니다" /> : <ul className="mt-3 divide-y divide-line">{data.closeCandidates.map((item) => <li className="py-3" key={item.id}><p className="text-[13px] font-semibold">{formatKstTime(item.startsAt)} {item.ticketTypeName}</p><p className="mt-1 text-[12px] text-warning">예약 {item.reservedCount}명 / 최소 인원 {item.minHeadcount}명</p><p className="mt-1 text-[12px] text-muted">결정 기한 {formatKstTime(item.decisionDeadlineAt)}까지</p><Link className="mt-2 inline-block text-[12px] text-accent" href={`/admin/schedules/${item.id}`}>처리하기</Link></li>)}</ul>}</Card>
          <Card className="p-5"><div className="flex items-center justify-between"><h2 className="text-[15px] font-semibold">노쇼 경계 임박 회원</h2><Badge tone="warning">{data?.noShowAlerts.length ?? 0}명</Badge></div>{!data ? <EmptyState message="불러오는 중입니다" /> : data.noShowAlerts.length === 0 ? <EmptyState message="경계 회원이 없습니다" /> : <ul className="mt-3 divide-y divide-line">{data.noShowAlerts.map((item) => <li className="flex items-center justify-between py-3" key={item.memberId}><div><p className="text-[13px] font-semibold">{item.name}</p><p className="mt-1 text-[12px] text-warning">노쇼 {item.noShowCount} / {item.threshold}회</p></div><Link className="text-[12px] text-warning" href={`/admin/members/${item.memberId}`}>예약 정지</Link></li>)}</ul>}</Card>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ label, value, caption, warn = false }: { label: string; value: string; caption?: string; warn?: boolean }) {
  return <Card className="p-[18px]"><p className="text-[12px] text-muted">{label}</p><p className={`mt-2 text-[28px] font-bold ${warn ? "text-warning" : ""}`}>{value}</p>{caption && <p className="mt-1 text-[11px] text-muted">{caption}</p>}</Card>;
}
