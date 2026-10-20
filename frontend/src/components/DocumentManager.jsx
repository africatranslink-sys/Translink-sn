import { useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { useLanguage } from '../context/useLanguage';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { formatDocumentStatus, formatDocumentType } from '../utils/documentLabels';

export default function DocumentManager({ items = [], onDelete }) {
  const { language } = useLanguage();
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const vehicleDocuments = items.filter((item) => item.camion_id || item.camion_plaque);
  const profileDocuments = items.filter((item) => !item.camion_id && !item.camion_plaque);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
    } catch (error) {
      setDeleteError(error.response?.data?.error || 'Impossible de supprimer ce document.');
    } finally {
      setDeleting(false);
    }
  };

  const renderGroup = (title, description, groupItems) => (
    <section className="space-y-3">
      <header className="flex items-end justify-between border-b border-slate-200 pb-3">
        <div><h2 className="font-bold text-[#121C2D]">{title}</h2><p className="text-sm text-slate-500">{description}</p></div>
        <span className="text-xs font-semibold text-slate-500">{groupItems.length} fichier{groupItems.length > 1 ? 's' : ''}</span>
      </header>
      {groupItems.length ? <div className="grid gap-3 md:grid-cols-2">{groupItems.map((item) => {
        const status = item.statut || 'EN_ATTENTE';
        const statusClass = 'bg-slate-100 text-slate-600';
        return <article key={item.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="rounded-lg bg-slate-100 p-2 text-slate-600"><Upload size={18} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="truncate font-bold text-[#121C2D]">{formatDocumentType(item.type_document, language)}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusClass}`}>{formatDocumentStatus(status, language)}</span></div>
            <p className="mt-1 text-xs text-slate-500">{item.camion_plaque ? `${language === 'en' ? 'Truck' : 'Camion'} · ${item.camion_plaque}` : language === 'en' ? 'Profile document' : 'Document du profil'} · {language === 'en' ? 'Added on' : 'Ajouté le'} {formatDate(item.date_ajout, language)}</p>
            {status === 'REFUSE' && item.motif_refus && <div className="mt-3 rounded-lg border-l-4 border-rose-500 bg-rose-50 p-3 text-sm text-rose-900"><strong>Motif du refus</strong><p className="mt-1 leading-5">{item.motif_refus}</p></div>}
            <div className="mt-3 flex items-center gap-3">
              {item.fichier_url && <a href={resolveMediaUrl(item.fichier_url)} target="_blank" rel="noreferrer" className="text-xs font-bold text-[#121C2D] underline decoration-slate-300 underline-offset-2 hover:decoration-[#121C2D]">{language === 'en' ? 'View file' : 'Voir le fichier'}</a>}
              <button type="button" onClick={() => { setDeleteError(''); setPendingDelete(item); }} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-700" aria-label={`${language === 'en' ? 'Delete' : 'Supprimer'} ${formatDocumentType(item.type_document, language)}`}><Trash2 size={13} /> {language === 'en' ? 'Delete' : 'Supprimer'}</button>
            </div>
          </div>
        </article>;
      })}</div> : <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">Aucun document dans cette catégorie.</p>}
    </section>
  );

  return <>
    {items.length ? <div className="space-y-8">{renderGroup('Documents du profil', 'Pièces d’identité et justificatifs personnels.', profileDocuments)}{renderGroup('Documents des véhicules', 'Cartes grises, assurances et photos de votre flotte.', vehicleDocuments)}</div> : <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center"><FileText size={32} className="mx-auto text-slate-300" /><p className="mt-3 text-sm text-slate-500">Aucun document transmis.</p></div>}
    <ConfirmDialog open={Boolean(pendingDelete)} title={language === 'en' ? 'Delete this document?' : 'Supprimer ce document ?'} message={pendingDelete ? language === 'en' ? `${formatDocumentType(pendingDelete.type_document, language)} will be removed from your records. This action cannot be undone.` : `${formatDocumentType(pendingDelete.type_document, language)} sera supprimé de votre dossier. Cette action est définitive.` : ''} confirmLabel={language === 'en' ? 'Delete document' : 'Supprimer le document'} busy={deleting} errorMessage={deleteError} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />
  </>;
}

function formatDate(value, language) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR');
}
