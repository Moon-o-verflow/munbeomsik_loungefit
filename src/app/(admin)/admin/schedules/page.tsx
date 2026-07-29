"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { formatKstDay, formatKstMonth, formatKstTime, kstNow, toKst } from "@/lib/time";

type DaySummary = { date: string; classCount: number; totalCapacity: number; totalReserved: number; isOpened: boolean };
type ScheduleSummary = { id: string; date: string; startsAt: string; endsAt: string; capacity: number; reservedCount: number; instructorName: string; status: "SCHEDULED" | "CLOSED" | "CANCELED"; ticketTypeName: string };
type Option = { id: string; name: string };
type PageData = { days: DaySummary[]; schedules: ScheduleSummary[]; branches: Option[]; ticketTypes: Option[] };
type ApiError = { error?: { message?: string } };
type FormState = { branchId: string; ticketTypeId: string; instructorName: string; startTime: string; durationMinutes: string; capacity: string; repeatType: "NONE" | "WEEKLY"; daysOfWeek: string[]; from: string; to: string };

const weekDays = [
  { value: "MON", label: "월" }, { value: "TUE", label: "화" }, { value: "WED", label: "수" }, { value: "THU", label: "목" }, { value: "FRI", label: "금" }, { value: "SAT", label: "토" }, { value: "SUN", label: "일" },
] as const;

function currentMonth() {
  return kstNow().format("YYYY-MM");
}

export default function AdminSchedulesPage() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<PageData | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [message, setMessage] = useState("");
  const [isFormOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ branchId: "", ticketTypeId: "", instructorName: "", startTime: "19:00", durationMinutes: "50", capacity: "8", repeatType: "NONE", daysOfWeek: [], from: "", to: "" });
  const [submitting, setSubmitting] = useState(false);

  const [year, numericMonth] = month.split("-").map(Number);

  async function load() {
    const response = await fetch(`/api/admin/schedules?year=${year}&month=${numericMonth}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      return;
    }
    const next = (await response.json()) as PageData;
    setData(next);
    setSelectedDate((current) => current || next.days[0]?.date || "");
    setForm((current) => ({ ...current, branchId: current.branchId || next.branches[0]?.id || "", ticketTypeId: current.ticketTypeId || next.ticketTypes[0]?.id || "", from: current.from || `${month}-01`, to: current.to || `${month}-28` }));
  }

  useEffect(() => {
    let active = true;
    void fetch(`/api/admin/schedules?year=${year}&month=${numericMonth}`)
      .then(async (response) => response.ok ? (await response.json()) as PageData : Promise.reject(((await response.json().catch(() => ({}))) as ApiError).error?.message ?? ""))
      .then((next) => {
        if (!active) return;
        setData(next);
        setSelectedDate((current) => current || next.days[0]?.date || "");
        setForm((current) => ({ ...current, branchId: current.branchId || next.branches[0]?.id || "", ticketTypeId: current.ticketTypeId || next.ticketTypes[0]?.id || "", from: current.from || `${month}-01`, to: current.to || `${month}-28` }));
      })
      .catch((error: unknown) => { if (active) setMessage(typeof error === "string" ? error : ""); });
    return () => { active = false; };
  }, [month, numericMonth, year]);

  const selectedSchedules = useMemo(() => data?.schedules.filter((schedule) => schedule.date === selectedDate) ?? [], [data, selectedDate]);
  const monthLabel = formatKstMonth(`${month}-01T00:00:00+09:00`);

  function previousMonth() {
    setMonth(toKst(`${month}-01T00:00:00+09:00`).subtract(1, "month").format("YYYY-MM"));
  }

  function nextMonth() {
    setMonth(toKst(`${month}-01T00:00:00+09:00`).add(1, "month").format("YYYY-MM"));
  }

  function toggleDay(day: string) {
    setForm((current) => ({ ...current, daysOfWeek: current.daysOfWeek.includes(day) ? current.daysOfWeek.filter((value) => value !== day) : [...current.daysOfWeek, day] }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/admin/schedules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        branchId: form.branchId,
        ticketTypeId: form.ticketTypeId,
        instructorName: form.instructorName,
        startTime: form.startTime,
        durationMinutes: Number(form.durationMinutes),
        capacity: Number(form.capacity),
        repeat: { type: form.repeatType, daysOfWeek: form.repeatType === "WEEKLY" ? form.daysOfWeek : [], from: form.from, ...(form.repeatType === "WEEKLY" ? { to: form.to } : {}) },
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      setSubmitting(false);
      return;
    }
    const result = (await response.json()) as { skipped: Array<{ date: string; reason: string }> };
    setFormOpen(false);
    setSubmitting(false);
    if (result.skipped.length > 0) setMessage(result.skipped[0].reason);
    await load();
  }

  return <section className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-[22px] font-bold">시간표 관리</h1><div className="mt-3 flex items-center gap-2"><button className="h-[34px] rounded-control border border-line bg-surface px-3 text-[12px]" onClick={previousMonth}>이전 달</button><p className="min-w-24 text-center text-[15px] font-semibold">{monthLabel}</p><button className="h-[34px] rounded-control border border-line bg-surface px-3 text-[12px]" onClick={nextMonth}>다음 달</button></div></div><Button className="min-h-[38px] text-[13px]" onClick={() => setFormOpen(true)}>수업 등록</Button></header>
    {message && <p className="mt-5 rounded-control border border-warning/30 bg-warning-soft p-3 text-[13px] text-warning">{message}</p>}
    <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,66fr)_minmax(280px,34fr)]">
      <Card className="overflow-hidden"><div className="grid grid-cols-7 border-b border-line bg-canvas text-center text-[12px] font-semibold text-muted">{["월", "화", "수", "목", "금", "토", "일"].map((day) => <span className="py-3" key={day}>{day}</span>)}</div><div className="grid grid-cols-7">{data ? data.days.map((day) => <button key={day.date} className={`min-h-24 border-b border-r border-line p-3 text-left hover:bg-canvas ${selectedDate === day.date ? "bg-accent-soft ring-1 ring-inset ring-accent" : ""}`} onClick={() => setSelectedDate(day.date)}><p className="text-[13px] font-semibold">{formatKstDay(day.date)}</p><p className="mt-3 text-[11px] text-muted">수업 {day.classCount}개</p><p className="mt-1 text-[11px] text-accent">예약 {day.totalReserved} / {day.totalCapacity}</p></button>) : <div className="col-span-7"><EmptyState message="시간표를 불러오는 중입니다" /></div>}</div><p className="border-t border-line px-5 py-3 text-[11px] text-muted">수업 예약 오픈은 정책에 따라 매일 자동으로 조회됩니다.</p></Card>
      <Card className="p-5"><h2 className="text-[15px] font-semibold">{selectedDate ? formatKstMonth(`${selectedDate}T00:00:00+09:00`) : "날짜 선택"}</h2>{!data ? <EmptyState message="불러오는 중입니다" /> : selectedSchedules.length === 0 ? <EmptyState message="등록된 수업이 없습니다" /> : <ul className="mt-3 divide-y divide-line">{selectedSchedules.map((schedule) => <li className="flex items-center justify-between gap-3 py-4" key={schedule.id}><div><p className="text-[13px] font-semibold">{formatKstTime(schedule.startsAt)}</p><p className="mt-1 text-[12px] text-muted">{schedule.ticketTypeName} · {schedule.instructorName}</p></div><div className="text-right"><p className={`text-[13px] font-semibold ${schedule.reservedCount === schedule.capacity ? "text-warning" : ""}`}>{schedule.reservedCount} / {schedule.capacity}</p><Link className="mt-1 inline-block text-[12px] text-accent" href={`/admin/schedules/${schedule.id}`}>상세</Link></div></li>)}</ul>}</Card>
    </div>
    <Modal className="max-w-xl p-0" isOpen={isFormOpen} onClose={() => setFormOpen(false)}><form onSubmit={(event) => void submit(event)}><header className="flex items-center justify-between border-b border-line px-6 py-5"><h2 className="text-[17px] font-semibold">수업 등록</h2><button className="text-[13px] text-muted" type="button" onClick={() => setFormOpen(false)}>닫기</button></header><div className="space-y-4 px-6 py-5"><label className="block text-[12px] text-muted">지점<Select className="mt-2 h-[38px] w-full" value={form.branchId} onChange={(event) => setForm({ ...form, branchId: event.target.value })}>{data?.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</Select></label><label className="block text-[12px] text-muted">수강권 종류<Select className="mt-2 h-[38px] w-full" value={form.ticketTypeId} onChange={(event) => setForm({ ...form, ticketTypeId: event.target.value })}>{data?.ticketTypes.map((ticketType) => <option key={ticketType.id} value={ticketType.id}>{ticketType.name}</option>)}</Select></label><label className="block text-[12px] text-muted">강사<Input className="mt-2 h-[38px]" value={form.instructorName} onChange={(event) => setForm({ ...form, instructorName: event.target.value })} /></label><div className="grid grid-cols-3 gap-3"><label className="text-[12px] text-muted">시작 시각<Input className="mt-2 h-[38px]" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label><label className="text-[12px] text-muted">수업 시간<Input className="mt-2 h-[38px]" type="number" min="1" value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} /></label><label className="text-[12px] text-muted">정원<Input className="mt-2 h-[38px]" type="number" min="1" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></label></div><div className="border-t border-line pt-4"><p className="text-[13px] font-semibold">반복 설정</p><div className="mt-3 flex gap-4 text-[13px]"><label><input className="mr-1" type="radio" checked={form.repeatType === "NONE"} onChange={() => setForm({ ...form, repeatType: "NONE" })} />한 날짜만</label><label><input className="mr-1" type="radio" checked={form.repeatType === "WEEKLY"} onChange={() => setForm({ ...form, repeatType: "WEEKLY" })} />반복 등록</label></div>{form.repeatType === "WEEKLY" && <div className="mt-3 rounded-control bg-canvas p-4"><div className="flex gap-2">{weekDays.map((day) => <button className={`h-8 w-8 rounded-full border text-[12px] ${form.daysOfWeek.includes(day.value) ? "border-accent bg-accent text-surface" : "border-line bg-surface text-muted"}`} type="button" onClick={() => toggleDay(day.value)} key={day.value}>{day.label}</button>)}</div><div className="mt-4 grid grid-cols-2 gap-3"><label className="text-[12px] text-muted">시작일<Input className="mt-1 h-[38px]" type="date" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} /></label><label className="text-[12px] text-muted">종료일<Input className="mt-1 h-[38px]" type="date" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} /></label></div></div>}{form.repeatType === "NONE" && <label className="mt-3 block text-[12px] text-muted">수업일<Input className="mt-1 h-[38px]" type="date" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} /></label>}</div></div><footer className="flex justify-end gap-2 border-t border-line px-6 py-5"><Button className="min-h-[38px] text-[13px]" type="button" variant="secondary" onClick={() => setFormOpen(false)}>취소</Button><Button className="min-h-[38px] text-[13px]" disabled={submitting}>{submitting ? "등록 중" : "등록하기"}</Button></footer></form></Modal>
  </section>;
}
