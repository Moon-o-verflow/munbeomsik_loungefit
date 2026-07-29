"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";

type Member = { id: string; name: string; phone: string; branchName: string; ticketTypeName: string | null; remainingCount: number; expiresAt: string | null; noShowCount: number; isSuspended: boolean };
type Data = { page: number; total: number; pageSize: number; threshold: number; members: Member[] };
type Filter = "all" | "suspended" | "noshow";
type ApiError = { error?: { message?: string } };

export default function AdminMembersPage() {
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState("");

  async function load(nextPage = 1) {
    const query = new URLSearchParams({ page: String(nextPage), keyword, filter });
    const response = await fetch(`/api/admin/members?${query}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      return;
    }
    setData((await response.json()) as Data);
  }

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ page: "1", keyword: "", filter });
    void fetch(`/api/admin/members?${query}`)
      .then(async (response) => response.ok ? (await response.json()) as Data : Promise.reject(((await response.json().catch(() => ({}))) as ApiError).error?.message ?? ""))
      .then((body) => { if (active) setData(body); })
      .catch((error: unknown) => { if (active) setMessage(typeof error === "string" ? error : ""); });
    return () => { active = false; };
  }, [filter]);

  return <section className="mx-auto max-w-7xl"><header><h1 className="text-[22px] font-bold">회원 관리</h1><p className="mt-1 text-[13px] text-muted">회원의 이용권, 예약 이력, 노쇼 현황을 확인합니다.</p></header>{message && <p className="mt-5 rounded-control border border-warning/30 bg-warning-soft p-3 text-[13px] text-warning">{message}</p>}<Card className="mt-6 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 p-5"><div className="flex flex-wrap gap-2"><Input className="h-[38px] w-60" placeholder="이름 또는 번호 뒤 4자리" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} /><Button className="min-h-[38px] text-[12px]" onClick={() => void load()}>검색</Button></div><div className="flex gap-2">{([ ["all", "전체"], ["suspended", "예약 정지"], ["noshow", "노쇼"] ] as const).map(([value, label]) => <button key={value} className={`h-[30px] rounded-control border px-3 text-[12px] ${filter === value ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted"}`} onClick={() => setFilter(value)}>{label}</button>)}</div></div>{!data ? <EmptyState message="회원 정보를 불러오는 중입니다" /> : data.members.length === 0 ? <EmptyState message="조건에 맞는 회원이 없습니다" /> : <DataTable><thead className="bg-canvas text-[12px] text-muted"><tr><th className="px-4 py-3 text-left">회원명</th><th className="px-4 py-3 text-left">연락처</th><th className="px-4 py-3 text-left">소속 지점</th><th className="px-4 py-3 text-left">이용권</th><th className="px-4 py-3 text-left">남은 횟수</th><th className="px-4 py-3 text-left">노쇼</th><th className="px-4 py-3 text-left">상태</th><th /></tr></thead><tbody>{data.members.map((member) => <tr className="border-t border-line text-[13px]" key={member.id}><td className="px-4 py-4 font-semibold">{member.name}</td><td className="px-4 py-4">{member.phone}</td><td className="px-4 py-4">{member.branchName}</td><td className="px-4 py-4">{member.ticketTypeName ?? "-"}</td><td className="px-4 py-4 font-semibold">{member.remainingCount}회</td><td className={`px-4 py-4 ${member.noShowCount >= data.threshold ? "font-semibold text-warning" : ""}`}>{member.noShowCount}회</td><td className="px-4 py-4"><Badge tone={member.isSuspended ? "warning" : "accent"}>{member.isSuspended ? "예약 정지" : "정상"}</Badge></td><td className="px-4 py-4 text-right"><Link className="text-[12px] text-accent" href={`/admin/members/${member.id}`}>상세</Link></td></tr>)}</tbody></DataTable>} {data && <footer className="flex items-center justify-between border-t border-line p-4 text-[12px] text-muted"><span>총 {data.total}명</span><div className="flex gap-2"><button className="rounded-control border border-line px-3 py-2 disabled:text-disabled" disabled={data.page <= 1} onClick={() => void load(data.page - 1)}>이전</button><span className="px-2 py-2">{data.page}</span><button className="rounded-control border border-line px-3 py-2 disabled:text-disabled" disabled={data.page * data.pageSize >= data.total} onClick={() => void load(data.page + 1)}>다음</button></div></footer>}</Card></section>;
}
