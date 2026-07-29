import type { ReactNode } from "react";

export function BottomSheet({ children, isOpen, onClose }: { children: ReactNode; isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-end bg-ink/40" role="dialog" aria-modal="true">
      <button className="absolute inset-0 cursor-default" aria-label="닫기" onClick={onClose} />
      <section className="relative z-10 w-full rounded-t-[20px] bg-surface p-5 pb-8">
        <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-line" />
        {children}
      </section>
    </div>
  );
}
