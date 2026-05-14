'use client';
import { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  destructive = false,
  onConfirm,
  onCancel
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="border border-line p-6 max-w-md backdrop:bg-ink/40">
      <h2 className="font-serif text-xl mb-2">{title}</h2>
      <p className="text-sm text-ink-soft mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 border border-line text-sm">
          取消
        </button>
        <button
          onClick={onConfirm}
          className={`px-4 py-2 text-sm text-bone ${destructive ? 'bg-red-700' : 'bg-ink'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
