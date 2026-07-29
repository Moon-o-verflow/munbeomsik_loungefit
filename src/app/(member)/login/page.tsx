"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ApiError = { error?: { message?: string } };

async function readError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as ApiError;
  return body.error?.message ?? "";
}

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestCode() {
    setLoading(true); setError("");
    const response = await fetch("/api/auth/member/request-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone }) });
    setLoading(false);
    if (!response.ok) { setError(await readError(response)); return; }
    setStep("code");
  }

  async function verifyCode() {
    setLoading(true); setError("");
    const response = await fetch("/api/auth/member/verify-code", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone, code }) });
    setLoading(false);
    if (!response.ok) { setError(await readError(response)); return; }
    router.replace("/schedules");
  }

  return <section className="flex min-h-screen flex-col px-5 pt-20">
    <p className="text-lg font-bold tracking-[0.16em] text-accent">LOUNGEFIT</p>
    {step === "phone" ? <>
      <h1 className="mt-8 text-xl font-bold">휴대폰 번호로 로그인</h1>
      <p className="mt-2 text-[13px] text-muted">라운지핏에 등록하신 번호를 입력해 주세요.</p>
      <label className="mt-10 text-[13px] text-muted">휴대폰 번호</label>
      <Input className="mt-2" inputMode="numeric" placeholder="01012345678" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ""))} />
      {error && <p className="mt-3 text-[13px] text-warning">{error}</p>}
      <div className="mt-auto pb-10"><Button className="w-full" disabled={loading || phone.length < 10} onClick={requestCode}>인증번호 받기</Button><p className="mt-4 text-center text-xs text-disabled">등록하지 않은 번호는 데스크로 문의해 주세요.</p></div>
    </> : <>
      <h1 className="mt-8 text-xl font-bold">인증번호 입력</h1>
      <p className="mt-2 text-[13px] text-muted">{phone.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3")}로 전송되었습니다.</p>
      <label className="mt-10 text-[13px] text-muted">인증번호</label>
      <Input className="mt-2 text-center text-xl tracking-[0.5em]" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
      {error && <p className="mt-3 text-[13px] text-warning">{error}</p>}
      <div className="mt-auto pb-10"><Button className="w-full" disabled={loading || code.length !== 6} onClick={verifyCode}>확인</Button><button className="mt-4 w-full text-[13px] text-accent" onClick={() => setStep("phone")}>재발송</button></div>
    </>}
  </section>;
}
