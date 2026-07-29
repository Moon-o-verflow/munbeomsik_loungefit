"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

type Ticket = { id: string; ticketTypeName: string; totalCount: number; remainingCount: number; holdCount: number; expiresAt: string; daysUntilExpiry: number; dailyLimit: number | null; weeklyLimit: number | null; dailyUsed: number; weeklyUsed: number };
type TicketResponse = { tickets: Ticket[]; suspension: { isSuspended: boolean; reason: string | null; until: string | null } };

export default function TicketsPage() {
  const [data, setData] = useState<TicketResponse | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/member/tickets");
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        setMessage(body.error?.message ?? "");
        return;
      }
      setData((await response.json()) as TicketResponse);
    })();
  }, []);

  return <section className="px-5 pt-6">
    <h1 className="text-xl font-bold">이용권</h1>
    {message && <p className="mt-4 text-sm text-warning">{message}</p>}
    {data?.suspension.isSuspended && <Card className="mt-4 border-warning/30 bg-warning-soft p-4"><p className="font-semibold text-warning">예약이 제한된 상태입니다.</p><p className="mt-1 text-sm text-muted">{data.suspension.reason}</p></Card>}
    <div className="mt-5 space-y-3">
      {!data ? <EmptyState message="이용권을 불러오는 중입니다" /> : data.tickets.length === 0 ? <EmptyState message="보유한 이용권이 없습니다" /> : data.tickets.map((ticket) => <Card key={ticket.id} className="p-5">
        <div className="flex justify-between"><Badge tone="accent">{ticket.ticketTypeName}</Badge><span className={ticket.daysUntilExpiry <= 17 ? "text-xs text-warning" : "text-xs text-muted"}>{ticket.expiresAt}까지</span></div>
        <div className="mt-5 flex items-end gap-2"><strong className="text-5xl leading-none">{ticket.remainingCount}</strong><span className="pb-1 text-base text-muted">/ {ticket.totalCount}회</span></div>
        <p className="mt-1 text-[13px] text-muted">남은 횟수</p>
        {ticket.holdCount > 0 && <p className="mt-3 rounded-control bg-quiet p-3 text-xs text-muted">대기 선차감 {ticket.holdCount}회가 포함되어 있습니다.</p>}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm"><p className="text-muted">하루 예약 한도 <strong className="ml-1 text-ink">{ticket.dailyUsed} / {ticket.dailyLimit ?? "무제한"}</strong></p><p className="text-muted">주간 예약 한도 <strong className="ml-1 text-ink">{ticket.weeklyUsed} / {ticket.weeklyLimit ?? "무제한"}</strong></p></div>
      </Card>)}
    </div>
  </section>;
}
