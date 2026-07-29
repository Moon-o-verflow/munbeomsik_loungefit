"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { formatKstInputDate, kstNow } from "@/lib/time";

type Stats = { summary: { reservations: number; attended: number; noShow: number; canceled: number; noShowRate: number }; byBranch: Array<{ branchName: string; reservations: number; attended: number; noShow: number; fillRate: number }>; crossBranchMatrix: Array<{ memberBranch: string; classBranch: string; count: number }>; byClass: Array<{ ticketTypeName: string; sessions: number; avgFillRate: number }> };
type ApiError = { error?: { message?: string } };

export default function AdminStatsPage() {
  const today = kstNow();
  const [from, setFrom] = useState(formatKstInputDate(today.startOf("month")));
  const [to, setTo] = useState(formatKstInputDate(today.endOf("month")));
  const [data, setData] = useState<Stats | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch(`/api/admin/stats?from=${from}&to=${to}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      return;
    }
    setData((await response.json()) as Stats);
  }

  useEffect(() => {
    let active = true;
    void fetch(`/api/admin/stats?from=${from}&to=${to}`)
      .then(async (response) => response.ok ? (await response.json()) as Stats : Promise.reject(((await response.json().catch(() => ({}))) as ApiError).error?.message ?? ""))
      .then((stats) => { if (active) setData(stats); })
      .catch((error: unknown) => { if (active) setMessage(typeof error === "string" ? error : ""); });
    return () => { active = false; };
  }, [from, to]);

  return <section className="mx-auto max-w-7xl"><header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-[22px] font-bold">통계</h1><p className="mt-1 text-[13px] text-muted">예약·출석·노쇼 현황을 조회합니다.</p></div><div className="flex gap-2"><Input className="h-[38px] w-36" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><Input className="h-[38px] w-36" type="date" value={to} onChange={(event) => setTo(event.target.value)} /><Button className="min-h-[38px] text-[12px]" onClick={() => void load()}>조회</Button></div></header>{message && <p className="mt-5 rounded-control border border-warning/30 bg-warning-soft p-3 text-[13px] text-warning">{message}</p>}{!data ? <EmptyState message="통계를 불러오는 중입니다" /> : <><div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric label="전체 예약" value={data.summary.reservations} /><Metric label="출석" value={data.summary.attended} /><Metric label="노쇼" value={data.summary.noShow} warn /><Metric label="취소" value={data.summary.canceled} /><Metric label="노쇼율" value={`${data.summary.noShowRate}%`} warn /></div><div className="mt-5 grid gap-5 xl:grid-cols-2"><TableCard title="지점별 현황" headers={["지점", "예약", "출석", "노쇼", "충원율"]} rows={data.byBranch.map((row) => [row.branchName, row.reservations, row.attended, row.noShow, `${row.fillRate}%`])} /><TableCard title="수업 종류별" headers={["수강권 종류", "수업 수", "평균 충원율"]} rows={data.byClass.map((row) => [row.ticketTypeName, row.sessions, `${row.avgFillRate}%`])} /></div><TableCard className="mt-5" title="교차 수강 현황" headers={["회원 소속 지점", "수강 지점", "예약"]} rows={data.crossBranchMatrix.map((row) => [row.memberBranch, row.classBranch, row.count])} /></>}</section>;
}

function Metric({ label, value, warn = false }: { label: string; value: string | number; warn?: boolean }) {
  return <Card className="p-5"><p className="text-[12px] text-muted">{label}</p><p className={`mt-2 text-[26px] font-bold ${warn ? "text-warning" : ""}`}>{value}</p></Card>;
}

function TableCard({ title, headers, rows, className = "" }: { title: string; headers: string[]; rows: Array<Array<string | number>>; className?: string }) {
  return <Card className={`overflow-hidden ${className}`}><h2 className="p-5 text-[15px] font-semibold">{title}</h2>{rows.length === 0 ? <EmptyState message="조회된 데이터가 없습니다" /> : <DataTable><thead className="bg-canvas text-[12px] text-muted"><tr>{headers.map((header) => <th className="px-4 py-3 text-left" key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr className="border-t border-line text-[13px]" key={`${title}-${index}`}>{row.map((value, column) => <td className="px-4 py-3" key={column}>{value}</td>)}</tr>)}</tbody></DataTable>}</Card>;
}
