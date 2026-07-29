"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/schedules", label: "시간표" },
  { href: "/reservations", label: "내 예약" },
  { href: "/tickets", label: "이용권" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex h-16 max-w-md border-t border-line bg-surface">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return <Link key={tab.href} href={tab.href} className={`flex flex-1 items-center justify-center text-xs ${active ? "font-semibold text-accent" : "text-disabled"}`}>{tab.label}</Link>;
      })}
    </nav>
  );
}
