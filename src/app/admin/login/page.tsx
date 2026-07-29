"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ApiError = { error?: { message?: string } };

export default function AdminLoginPage() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/auth/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginId, password }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as ApiError;
      setMessage(body.error?.message ?? "");
      setSubmitting(false);
      return;
    }
    window.location.assign("/admin");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-quiet p-5">
      <form className="w-full max-w-sm rounded-card border border-line bg-surface px-9 py-10" onSubmit={(event) => void submit(event)}>
        <header className="text-center">
          <p className="text-[18px] font-bold tracking-[0.18em] text-accent">LOUNGEFIT</p>
          <h1 className="mt-2 text-[12px] text-muted">운영 관리자</h1>
        </header>
        <div className="mt-8 space-y-4">
          <label className="block text-[12px] text-muted">아이디<Input className="mt-2 h-[38px]" autoComplete="username" placeholder="manager_gangnam" value={loginId} onChange={(event) => setLoginId(event.target.value)} /></label>
          <label className="block text-[12px] text-muted">비밀번호<Input className="mt-2 h-[38px]" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        </div>
        {message && <p className="mt-4 rounded-control border border-warning/30 bg-warning-soft p-3 text-[12px] text-warning">{message}</p>}
        <Button className="mt-6 min-h-[42px] w-full text-[13px]" disabled={submitting}>{submitting ? "로그인 중" : "로그인"}</Button>
        <p className="mt-4 text-center text-[11px] text-disabled">계정 문의는 본사 운영팀으로 연락해 주세요.</p>
      </form>
    </main>
  );
}
