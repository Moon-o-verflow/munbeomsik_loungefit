"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const menu = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/schedules", label: "시간표 관리" },
  { href: "/admin/proxy-booking", label: "대리 예약" },
  { href: "/admin/members", label: "회원 관리" },
  { href: "/admin/stats", label: "통계" },
  { href: "/admin/policy", label: "정책 설정" },
] as const;

const unavailableMenu = ["데이터 이관"] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/auth/admin/logout", { method: "POST" });
    window.location.assign("/admin/login");
  }

  return (
    <div className="min-h-screen bg-quiet lg:flex">
      <aside className="flex min-h-screen w-60 shrink-0 flex-col bg-sidebar px-4 py-7 text-sidebar-text">
        <div className="px-3">
          <p className="text-[15px] font-bold tracking-[0.18em] text-surface">LOUNGEFIT</p>
          <p className="mt-2 text-[11px] text-sidebar-muted">운영 관리자</p>
        </div>
        <nav className="mt-8 space-y-1" aria-label="관리자 메뉴">
          {menu.map((item) => {
            const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-[42px] items-center rounded-control px-3 text-[13px] ${active ? "bg-sidebar-active font-semibold text-surface" : "hover:bg-sidebar-active"}`}
              >
                {item.label}
              </Link>
            );
          })}
          {unavailableMenu.map((label) => <span key={label} className="flex h-[42px] items-center px-3 text-[13px] text-sidebar-muted">{label}</span>)}
        </nav>
        <div className="mt-auto border-t border-surface/10 px-3 pt-5">
          <p className="text-[12px]">운영 계정</p>
          <button className="mt-3 text-[11px] text-sidebar-muted hover:text-surface" onClick={() => void logout()}>로그아웃</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-7 lg:px-8">{children}</main>
    </div>
  );
}
