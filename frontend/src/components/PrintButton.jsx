import { Printer } from 'lucide-react';

export default function PrintButton({ children = 'Imprimer', className = '' }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`print:hidden inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-brand-dark hover:text-brand-dark ${className}`}
    >
      <Printer size={16} />
      {children}
    </button>
  );
}
