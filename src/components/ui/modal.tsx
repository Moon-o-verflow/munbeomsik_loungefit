import type { ReactNode } from "react";

export function Modal({ children, isOpen, onClose }: { children: ReactNode; isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/45 p-5" role="dialog" aria-modal="true">
      <button className="absolute inset-0 cursor-default" aria-label="닫기" onClick={onClose} />
      <section className="relative z-10 w-full max-w-sm rounded-2xl bg-surface p-5">{children}</section>
    </div>
  );
}
