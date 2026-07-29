"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type PolicyData = Record<string, number | string | boolean>;
type ApiError = { error?: { message?: string; fields?: Record<string, string> } };

const fields = [
  ["cancelDeadlineMinutes", "취소 마감(분)"], ["rollingOpenDays", "롤링 오픈 일수"], ["rollingOpenHour", "롤링 오픈 시각"],
  ["waitlistTimeoutMinutes", "대기 확정 시간(분)"], ["waitlistUrgentTimeoutMinutes", "임박 대기 확정 시간(분)"], ["waitlistUrgentThresholdMinutes", "임박 기준(분)"],
  ["quietHoursStart", "심야 시작 시각"], ["quietHoursEnd", "심야 종료 시각"], ["classCloseDeadlineMinutes", "폐강 결정 마감(분)"], ["classMinHeadcount", "폐강 최소 인원"],
  ["noshowThresholdCount", "노쇼 경계 횟수"], ["noshowSuspendDays", "예약 정지 안내 일수"],
] as const;

export default function AdminPolicyPage() {
  const [data, setData] = useState<PolicyData | null>(null);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/policy")
      .then(async (response) => response.ok ? (await response.json()) as PolicyData : Promise.reject(((await response.json().catch(() => ({}))) as ApiError).error?.message ?? ""))
      .then((policy) => { if (active) setData(policy); })
      .catch((error: unknown) => { if (active) setMessage(typeof error === "string" ? error : ""); });
    return () => { active = false; };
  }, []);

  async function save() {
    if (!data) return;
    setSaving(true);
    setMessage("");
    setFieldErrors({});
    const response = await fetch("/api/admin/policy", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries([...fields.map(([key]) => [key, data[key]]), ["noshowResetCycle", data.noshowResetCycle], ["proxyBookingEnabled", data.proxyBookingEnabled]])) });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      setFieldErrors(body.error?.fields ?? {});
      setSaving(false);
      return;
    }
    setData((await response.json()) as PolicyData);
    setSaving(false);
  }

  return <section className="mx-auto max-w-4xl"><header><h1 className="text-[22px] font-bold">정책 설정</h1><p className="mt-1 text-[13px] text-muted">모든 지점에 공통으로 적용되는 운영 정책입니다.</p></header>{message && <p className="mt-5 rounded-control border border-warning/30 bg-warning-soft p-3 text-[13px] text-warning">{message}</p>}{!data ? <EmptyState message="정책 정보를 불러오는 중입니다" /> : <Card className="mt-6 overflow-hidden"><div className="grid gap-x-6 gap-y-4 p-6 sm:grid-cols-2">{fields.map(([key, label]) => <label className="block text-[12px] text-muted" key={key}>{label}<Input className={`mt-2 h-[38px] ${fieldErrors[key] ? "border-warning" : ""}`} type="number" value={String(data[key])} onChange={(event) => setData({ ...data, [key]: Number(event.target.value) })} />{fieldErrors[key] && <span className="mt-1 block text-[11px] text-warning">{fieldErrors[key]}</span>}</label>)}<label className="block text-[12px] text-muted">노쇼 초기화 주기<Select className="mt-2 h-[38px] w-full" value={String(data.noshowResetCycle)} onChange={(event) => setData({ ...data, noshowResetCycle: event.target.value })}><option value="MONTHLY">월간</option></Select></label><label className="flex items-center gap-3 pt-6 text-[13px]"><input type="checkbox" checked={Boolean(data.proxyBookingEnabled)} onChange={(event) => setData({ ...data, proxyBookingEnabled: event.target.checked })} />대리 예약 허용</label></div><footer className="flex justify-end border-t border-line px-6 py-5"><Button className="min-h-[38px] text-[13px]" disabled={saving} onClick={() => void save()}>{saving ? "저장 중" : "정책 저장"}</Button></footer></Card>}</section>;
}
