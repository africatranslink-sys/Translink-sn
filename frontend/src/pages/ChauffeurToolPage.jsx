import React, { useCallback, useEffect, useState } from 'react';
import { Ban, FileText, RefreshCw } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import ConfirmDialog from '../components/ConfirmDialog';
import DocumentManager from '../components/DocumentManager';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../utils/api';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';
import PrintButton from '../components/PrintButton';



const config = {
  missions: {
    title: 'Mes missions',
    subtitle: 'Consultez vos missions de transport en cours.',
    endpoint: '/api/courses/me',
  },
  historique: {
    title: 'Historique',
    subtitle: 'Retrouvez vos anciennes missions.',
    endpoint: '/api/courses/me',
  },
  documents: {
    title: 'Mes documents',
    subtitle: 'Vérifiez les justificatifs requis (Permis de conduire).',
    endpoint: '/api/documents',
  },
};

export default function ChauffeurToolPage({ mode = 'missions' }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const page = config[mode] || config.missions;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(page.endpoint));
  const [error, setError] = useAutoDismissMessage('');
  const [pendingCourseStatus, setPendingCourseStatus] = useState(null);
  const [statusUpdateError, setStatusUpdateError] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [courseToDecline, setCourseToDecline] = useState(null);
  const [declineError, setDeclineError] = useState('');
  const [declining, setDeclining] = useState(false);

  const updateCourseStatus = (courseId, newStatus) => {
    setStatusUpdateError('');
    setPendingCourseStatus({ courseId, newStatus });
  };

  const confirmCourseStatus = async () => {
    if (!pendingCourseStatus) return;
    setStatusUpdating(true);
    try {
      await api.put(`/api/courses/${pendingCourseStatus.courseId}/status`, { statut: pendingCourseStatus.newStatus });
      setPendingCourseStatus(null);
      loadItems();
    } catch (err) {
      setStatusUpdateError(err.response?.data?.error || 'Erreur lors de la mise à jour.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const declineCourse = async () => {
    if (!courseToDecline) return;
    setDeclining(true);
    setDeclineError('');
    try {
      await api.delete(`/api/courses/${courseToDecline.id}/decline`);
      setCourseToDecline(null);
      await loadItems();
    } catch (err) {
      setDeclineError(err.response?.data?.error || 'Impossible de décliner cette mission.');
    } finally {
      setDeclining(false);
    }
  };

  const loadItems = useCallback(() => {
    if (!page.endpoint) return;
    setLoading(true);
    api.get(page.endpoint)
      .then((res) => {
        let data = Array.isArray(res.data) ? res.data : [];
        if (mode === 'missions') {
          data = data.filter((c) => ['CAMION_TROUVE', 'CHARGEMENT', 'LIVRAISON'].includes(c.statut));
        } else if (mode === 'historique') {
          data = data.filter((c) => ['LIVREE', 'TERMINEE', 'SOLDE_REGLE'].includes(c.statut));
        }
        setItems(data);
      })
      .catch((err) => setError(err.response?.data?.error || 'Erreur réseau.'))
      .finally(() => setLoading(false));
  }, [mode, page.endpoint, setError]);

  const deleteDocument = async (documentId) => {
    await api.delete(`/api/documents/${documentId}`);
    await loadItems();
  };

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!socket) return;
    const handleCourseUpdated = () => {
      if (mode === 'missions' || mode === 'historique') {
        loadItems();
      }
    };
    socket.on('courseUpdated', handleCourseUpdated);
    return () => {
      socket.off('courseUpdated', handleCourseUpdated);
    };
  }, [socket, mode, loadItems]);

  return (
    <DashboardLayout user={user}>
      <div className="print-content mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-3xl font-bold tracking-tight text-[#121C2D]">{page.title}</h1><p className="mt-2 text-sm text-slate-500">{page.subtitle}</p></div>
          {mode === 'historique' && <PrintButton>Imprimer l’historique</PrintButton>}
        </header>

        {mode === 'missions' && <p className="mb-6 rounded-lg border border-[#d4e5df] border-l-4 border-l-[#328173] bg-[#f3f8f5] px-4 py-3 text-sm text-[#365b52]">Le compte de réception dans Paramètres sert à recevoir vos reversements. L’avance de la course doit être payée séparément par le chargeur avant le démarrage.</p>}

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 shadow-sm">
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {loading ? (
            <div className="flex h-32 flex-col items-center justify-center text-slate-500">
              <RefreshCw className="mb-2 h-6 w-6 animate-spin text-[#FF6A3D]" />
              <p className="text-sm">Chargement des données...</p>
            </div>
          ) : mode === 'documents' ? (
            <DocumentManager items={items} onDelete={deleteDocument} />
          ) : items.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-slate-500">
              <FileText className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium">Aucun élément trouvé.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-lg border border-slate-100 p-4 transition hover:bg-slate-50">
                  <div>
                    <h3 className="font-semibold text-[#121C2D]">
                      {mode === 'documents' ? item.type_document : `Course: ${item.ville_depart || 'N/A'} → ${item.ville_arrivee || 'N/A'}`}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {mode === 'documents'
                        ? `Soumis le: ${new Date(item.cree_le).toLocaleDateString('fr-FR')}`
                        : `Marchandise: ${item.nature_marchandise || '-'} · ${item.tonnage || '-'}t · Plaque: ${item.plaque_immatriculation || '-'}`}
                    </p>
                  </div>
                  <div className="mt-4 sm:mt-0 flex flex-col items-end gap-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      item.statut === 'VALIDE' || item.statut === 'SOLDE_REGLE' || item.statut === 'TERMINEE'
                        ? 'bg-green-100 text-green-700'
                        : item.statut === 'LIVREE'
                        ? 'bg-orange-100 text-orange-800'
                        : item.statut === 'REFUSE'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {item.statut}
                    </span>
                    {mode === 'missions' && item.statut === 'CAMION_TROUVE' && item.paiement_statut_avance === 'VALIDE' && (
                      <button onClick={() => updateCourseStatus(item.id, 'CHARGEMENT')} className="text-xs font-bold text-white bg-blue-600 px-3 py-1.5 rounded-md hover:bg-blue-700">Démarrer le chargement</button>
                    )}
                    {mode === 'missions' && item.statut === 'CAMION_TROUVE' && item.paiement_statut_avance !== 'VALIDE' && (
                      <span className="max-w-xs text-right text-xs text-[#8b6b32]">
                        {!item.paiement_id
                          ? 'En attente du paiement de l’avance par le chargeur'
                          : item.reference_transaction_avance_chargeur
                            ? 'Référence transmise, en attente de validation de l’avance'
                            : 'En attente de la référence de paiement du chargeur'}
                      </span>
                    )}
                    {mode === 'missions' && item.statut === 'CAMION_TROUVE' && !item.paiement_id && (
                      <button type="button" onClick={() => { setDeclineError(''); setCourseToDecline(item); }} className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">
                        <Ban size={14} /> Décliner la mission
                      </button>
                    )}
                    {mode === 'missions' && item.statut === 'CHARGEMENT' && (
                      <button onClick={() => updateCourseStatus(item.id, 'LIVRAISON')} className="text-xs font-bold text-white bg-indigo-600 px-3 py-1.5 rounded-md hover:bg-indigo-700">Terminer le chargement</button>
                    )}
                    {mode === 'missions' && item.statut === 'LIVRAISON' && (
                      <button onClick={() => updateCourseStatus(item.id, 'LIVREE')} className="text-xs font-bold text-white bg-green-600 px-3 py-1.5 rounded-md hover:bg-green-700">Notifier la livraison</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingCourseStatus)}
        title="Confirmer l’étape de la course ?"
        message={pendingCourseStatus ? `La course passera au statut « ${pendingCourseStatus.newStatus} ».` : ''}
        confirmLabel="Confirmer l’étape"
        tone="neutral"
        busy={statusUpdating}
        errorMessage={statusUpdateError}
        onCancel={() => { setPendingCourseStatus(null); setStatusUpdateError(''); }}
        onConfirm={confirmCourseStatus}
      />
      <ConfirmDialog
        open={Boolean(courseToDecline)}
        title="Décliner cette mission ?"
        message={courseToDecline ? `La mission ${courseToDecline.ville_depart || 'Départ'} → ${courseToDecline.ville_arrivee || 'Arrivée'} sera retirée de votre liste, l’offre sera republiée et le camion libéré. Cette action est possible uniquement avant le démarrage du paiement.` : ''}
        confirmLabel="Décliner la mission"
        busy={declining}
        errorMessage={declineError}
        onCancel={() => { setCourseToDecline(null); setDeclineError(''); }}
        onConfirm={declineCourse}
      />
    </DashboardLayout>
  );
}
