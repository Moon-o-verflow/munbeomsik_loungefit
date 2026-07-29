"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { formatKstAdminDateTime, formatKstInputDate, kstNow } from "@/lib/time";

type Member = { id: string; name: string; phone?: string; phoneLast4?: string; branchName?: string; remainingCount: number; noShowCount?: number; isSuspended?: boolean; isCrossBranch: boolean };
type Ticket = { id: string; ticketTypeName: string; remainingCount: number; holdCount: number; expiresAt: string; dailyLimit: number | null; dailyUsed: number; weeklyLimit: number | null; weeklyUsed: number; isActive: boolean };
type AvailableSchedule = { id: string; startsAt: string; branchName: string; ticketTypeName: string; instructorName: string; capacity: number; reservedCount: number; bookable: boolean; blockedReason: string | null; blockedMessage: string | null };
type AvailabilityResponse = { member: Member & { tickets?: Ticket[] }; schedules: AvailableSchedule[] };
type Availability = AvailabilityResponse & { tickets: Ticket[] };
type ApiError = { error?: { message?: string } };

export default function ProxyBookingPage() {
  const [keyword, setKeyword] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Member | null>(null);
  const [date, setDate] = useState(formatKstInputDate(kstNow()));
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function search() {
    setMessage("");
    const response = await fetch(`/api/admin/members/search?q=${encodeURIComponent(keyword)}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      return;
    }
    setMembers(((await response.json()) as { members: Member[] }).members);
  }

  async function loadAvailability(memberId = selected?.id) {
    if (!memberId) return;
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/admin/proxy-booking/available?memberId=${memberId}&date=${date}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      setLoading(false);
      return;
    }
    setAvailability(normalizeAvailability((await response.json()) as AvailabilityResponse));
    setLoading(false);
  }

  useEffect(() => {
    if (!selected) return;
    let active = true;
    void fetch(`/api/admin/proxy-booking/available?memberId=${selected.id}&date=${date}`)
      .then(async (response) => response.ok ? normalizeAvailability((await response.json()) as AvailabilityResponse) : Promise.reject(((await response.json().catch(() => ({}))) as ApiError).error?.message ?? ""))
      .then((next) => { if (active) { setAvailability(next); setLoading(false); } })
      .catch((error: unknown) => { if (active) { setMessage(typeof error === "string" ? error : ""); setLoading(false); } });
    return () => { active = false; };
  }, [date, selected]);

  async function chooseMember(member: Member) {
    setSelected(member);
    setAvailability(null);
    await loadAvailability(member.id);
  }

  async function book(scheduleId: string) {
    if (!selected) return;
    const response = await fetch("/api/admin/proxy-booking", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ memberId: selected.id, scheduleId }) });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      return;
    }
    await loadAvailability();
  }

  return <section className="mx-auto max-w-7xl"><header><h1 className="text-[22px] font-bold">대리 예약</h1><p className="mt-1 text-[13px] text-muted">전화·카톡으로 접수된 예약을 회원 대신 등록합니다.</p></header>{message && <p className="mt-5 rounded-control border border-warning/30 bg-warning-soft p-3 text-[13px] text-warning">{message}</p>}<div className="mt-6 grid gap-5 xl:grid-cols-[minmax(260px,34fr)_minmax(0,66fr)]"><Card className="p-5"><h2 className="text-[15px] font-semibold">회원 검색</h2><div className="mt-4 flex gap-2"><Input className="h-[38px]" placeholder="이름 또는 번호 뒤 4자리" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} /><Button className="min-h-[38px] shrink-0 text-[12px]" onClick={() => void search()}>검색</Button></div><ul className="mt-3 divide-y divide-line">{members.map((member) => <li key={member.id}><button className={`w-full py-4 text-left ${selected?.id === member.id ? "border-l-4 border-accent bg-accent-soft pl-3" : ""}`} onClick={() => void chooseMember(member)}><p className="text-[13px] font-semibold">{member.name}</p><p className="mt-1 text-[12px] text-muted">{member.phone ?? `***-${member.phoneLast4 ?? ""}`}{member.branchName ? ` · ${member.branchName}` : ""}</p></button></li>)}</ul>{members.length === 0 && <EmptyState message="회원 이름 또는 번호 뒤 4자리로 검색하세요" />}</Card><div>{!selected ? <Card><EmptyState message="대리 예약할 회원을 선택하세요" /></Card> : <><Card className="border-accent bg-accent-soft p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-[17px] font-semibold">{availability?.member.name ?? selected.name}</h2><p className="mt-1 text-[13px] text-muted">{availability?.member.phone ?? selected.phone ?? `***-${availability?.member.phoneLast4 ?? selected.phoneLast4 ?? ""}`}</p></div>{availability?.member.branchName && <Badge tone="accent">{availability.member.branchName}</Badge>}</div><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4"><Info label="남은 횟수" value={`${availability?.member.remainingCount ?? selected.remainingCount}회`} /><Info label="노쇼" value={`${availability?.member.noShowCount ?? selected.noShowCount ?? 0}회`} />{availability?.tickets.slice(0, 2).map((ticket) => <Info key={ticket.id} label={ticket.ticketTypeName} value={`${ticket.remainingCount}회`} />)}</div></Card><div className="mt-5 flex items-center justify-between"><h2 className="text-[15px] font-semibold">수업 선택</h2><Input className="h-[38px] w-40" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div className="mt-3 space-y-3">{loading ? <EmptyState message="예약 가능 여부를 확인하는 중입니다" /> : availability?.schedules.length === 0 ? <Card><EmptyState message="선택한 날짜에 수업이 없습니다" /></Card> : availability?.schedules.map((schedule) => <Card className="flex flex-wrap items-center justify-between gap-4 p-5" key={schedule.id}><div><p className="text-[15px] font-semibold">{formatKstAdminDateTime(schedule.startsAt)}</p><p className="mt-2 text-[13px]">{schedule.ticketTypeName}</p><p className="mt-1 text-[12px] text-muted">{schedule.branchName} · {schedule.instructorName}</p></div><div className="text-right"><p className={`text-[13px] font-semibold ${schedule.reservedCount === schedule.capacity ? "text-warning" : ""}`}>{schedule.reservedCount} / {schedule.capacity}명</p>{schedule.bookable ? <Button className="mt-3 min-h-[38px] text-[12px]" onClick={() => void book(schedule.id)}>예약 등록</Button> : <p className="mt-3 text-[12px] text-warning">{schedule.blockedMessage}</p>}</div></Card>)}</div></>}</div></div></section>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-muted">{label}</p><p className="mt-1 text-[15px] font-semibold">{value}</p></div>;
}

function normalizeAvailability(response: AvailabilityResponse): Availability {
  return { ...response, tickets: response.member.tickets ?? [] };
}
