import { useEffect, useId, useRef } from 'react';
import { AlertTriangle, CircleHelp } from 'lucide-react';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'danger',
  busy = false,
  inputLabel,
  inputValue = '',
  inputPlaceholder,
  errorMessage,
  onInputChange,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const messageId = useId();
  const inputId = useId();
  const confirmRef = useRef(null);
  const cancelRef = useRef(onCancel);
  const isDanger = tone === 'danger';

  useEffect(() => {
    cancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!open) return undefined;

    const previousFocus = document.activeElement;
    confirmRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) cancelRef.current?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [open, busy]);

  if (!open) return null;

  const Icon = isDanger ? AlertTriangle : CircleHelp;
  const iconClasses = isDanger ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-700';
  const confirmClasses = isDanger
    ? 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-300'
    : 'bg-[#123b4a] text-white hover:bg-[#0f2f3b] focus-visible:ring-teal-300';

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#121C2D]/60 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconClasses}`}>
            <Icon size={21} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-bold text-[#121C2D]">{title}</h2>
            <p id={messageId} className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
          </div>
        </div>
        {inputLabel && (
          <label htmlFor={inputId} className="mt-5 block text-sm font-semibold text-[#121C2D]">
            {inputLabel}
            <textarea
              id={inputId}
              value={inputValue}
              onChange={(event) => onInputChange?.(event.target.value)}
              placeholder={inputPlaceholder}
              rows={3}
              className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-[#2F80ED] focus:ring-2 focus:ring-blue-100"
            />
          </label>
        )}
        {errorMessage && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{errorMessage}</p>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2.5 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 ${confirmClasses}`}
          >
            {busy ? 'Traitement...' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
