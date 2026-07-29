"use client";

import { usePathname } from "next/navigation";
import { TabBar } from "@/components/ui/tab-bar";

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <main className="mx-auto min-h-screen max-w-md bg-canvas pb-20">{children}{pathname !== "/login" && <TabBar />}</main>;
}
