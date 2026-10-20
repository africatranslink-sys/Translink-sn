import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  History,
  Truck,
  MapPin,
  Camera,
  ChevronLeft,
  ChevronRight,
  ArrowLeftRight,
  RefreshCw,
  Plus,
  X,
  MessageCircle,
  MoreHorizontal,
  Gauge,
  Users,
  Pencil,
  Trash2,
  MapPinned,
  FileText,
  Upload,
  CheckCircle2,
  Clock3,
  CircleAlert,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import ConfirmDialog from '../components/ConfirmDialog';
import DocumentManager from '../components/DocumentManager';
import DemandLocationMap from '../components/DemandLocationMap';
import NegotiationChatDialog from '../components/NegotiationChatDialog';
import CitySelect from '../components/CitySelect';
import RouteMap from '../components/RouteMap';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../utils/api';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';
import PrintButton from '../components/PrintButton';
import { westAfricanCities } from '../utils/westAfricanCities';

const getConfig = (role) => ({
  camions: {
    title: role === 'CHAUFFEUR' ? 'Mon camion' : 'Mes camions',
    subtitle: role === 'CHAUFFEUR' 
      ? 'Informations sur le véhicule que vous conduisez.' 
      : 'Suivez votre flotte, votre disponibilité et les informations de vos véhicules.',
    endpoint: '/api/camions/me',
  },
  recherche: {
    title: 'Offres disponibles',
    subtitle: 'Consultez les demandes actives et répondez aux offres pertinentes.',
    endpoint: '/api/annonces/demandes',
  },
  courses: {
    title: 'Mes courses',
    subtitle: 'Retrouvez les missions passées et en cours.',
    endpoint: '/api/courses/me',
  },
  historique: {
    title: 'Historique des courses',
    subtitle: 'Retrouvez les transports terminés et réglés.',
    endpoint: '/api/courses/me',
  },
  documents: {
    title: 'Mes documents',
    subtitle: 'Vérifiez les justificatifs requis et leur statut de validation.',
    endpoint: '/api/documents',
  },
  chauffeurs: {
    title: 'Mes chauffeurs',
    subtitle: 'Gérez et ajoutez les chauffeurs de votre flotte.',
    endpoint: '/api/auth/chauffeurs/me',
  },
});

export default function TransporteurToolPage({ mode = 'camions' }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const isIndependentDriver = user?.role === 'CHAUFFEUR' && !user?.employeur_id;
  const page = getConfig(user?.role)[mode] || getConfig(user?.role).camions;
  const [items, setItems] = useState([]);
  const [truckDocuments, setTruckDocuments] = useState([]);
  const [query, setQuery] = useState('');
  const [showAddCamion, setShowAddCamion] = useState(false);
  const [showAddChauffeur, setShowAddChauffeur] = useState(false);
  const [fleetCamions, setFleetCamions] = useState([]);
  const [fleetChauffeurs, setFleetChauffeurs] = useState([]);
  const [loading, setLoading] = useState(Boolean(page.endpoint));
  const [error, setError] = useAutoDismissMessage('');
  const [success, setSuccess] = useAutoDismissMessage('');

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      if (!page.endpoint) {
        setItems([]);
        return;
      }

      const response = await api.get(page.endpoint);
      const data = Array.isArray(response.data) ? response.data : [];
      setItems(mode === 'historique' ? data.filter((item) => item.statut === 'SOLDE_REGLE') : data);
      if (mode === 'camions' && user?.role === 'CHAUFFEUR') {
        const documentsResponse = await api.get('/api/documents');
        setTruckDocuments(Array.isArray(documentsResponse.data) ? documentsResponse.data : []);
      }
      if (mode === 'camions' && ['TRANSPORTEUR', 'ENTREPRISE'].includes(user?.role)) {
        const driversResponse = await api.get('/api/auth/chauffeurs/me');
        setFleetChauffeurs(Array.isArray(driversResponse.data) ? driversResponse.data : []);
      }
      if (mode === 'recherche' && ['TRANSPORTEUR', 'ENTREPRISE', 'CHAUFFEUR'].includes(user?.role)) {
        const trucksResponse = await api.get('/api/camions/me');
        const ownedTrucks = (Array.isArray(trucksResponse.data) ? trucksResponse.data : [])
          .filter((truck) => String(truck.proprietaire_id) === String(user.id));
        setFleetCamions(ownedTrucks);
        if (user.role === 'CHAUFFEUR') {
          setFleetChauffeurs([]);
        } else {
          const driversResponse = await api.get('/api/auth/chauffeurs/me');
          setFleetChauffeurs(Array.isArray(driversResponse.data) ? driversResponse.data : []);
        }
      }
    } catch (requestError) {
      setItems([]);
      setError(requestError.response?.data?.error || 'Impossible de charger les données.');
    } finally {
      setLoading(false);
    }
  }, [mode, page.endpoint, user?.id, user?.role, setError]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (!socket) return;
    const handleCourseUpdated = () => {
      if (mode === 'camions' || mode === 'courses' || mode === 'recherche') {
        loadItems();
      }
    };
    socket.on('courseUpdated', handleCourseUpdated);
    return () => {
      socket.off('courseUpdated', handleCourseUpdated);
    };
  }, [socket, mode, loadItems]);

  const updateCourseStatus = async (courseId, newStatus) => {
    try {
      await api.put(`/api/courses/${courseId}/status`, { statut: newStatus });
      loadItems();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Erreur lors de la mise à jour.');
    }
  };

  const deleteDocument = async (documentId) => {
    await api.delete(`/api/documents/${documentId}`);
    await loadItems();
  };

  const acceptOffer = async ({ demandeId, camionId, chauffeurId }) => {
    setError('');
    setSuccess('');
    try {
      await api.post('/api/courses', { demande_id: demandeId, camion_id: camionId, chauffeur_id: chauffeurId });
      setSuccess('Offre acceptée. Le camion est passé en mission et le chauffeur a reçu une notification.');
      await loadItems();
    } catch (requestError) {
      throw requestError;
    }
  };

  const startNegotiation = useCallback(async ({ demandeId, camionId, chauffeurId }) => {
    const { data } = await api.post('/api/chats', {
      demande_id: demandeId,
      camion_id: camionId,
      chauffeur_id: chauffeurId,
    });
    return data.conversation;
  }, []);

  const assignTruckDriver = async (truckId, driverId) => {
    setError('');
    setSuccess('');
    try {
      const response = await api.put(`/api/camions/${truckId}/chauffeur`, {
        chauffeur_id: driverId || null,
      });
      setSuccess(response.data.message || 'Affectation du chauffeur enregistrée.');
      await loadItems();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible d’affecter ce chauffeur au camion.');
    }
  };

  const filteredItems = useMemo(() => {
    if (!items?.length) return [];
    return items.filter((item) => JSON.stringify(item).toLowerCase().includes(query.toLowerCase()));
  }, [items, query]);

  return (
    <DashboardLayout user={user}>
      <div className="print-content space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF6A3D]">Espace {user?.role}</p>
            <h1 className="mt-2 text-3xl font-bold text-[#121C2D]">{page.title}</h1>
            <p className="mt-1 text-slate-500">{page.subtitle}</p>
          </div>

          {mode === 'camions' && (user?.role === 'TRANSPORTEUR' || user?.role === 'ENTREPRISE' || (user?.role === 'CHAUFFEUR' && !user?.employeur_id && !loading && items.length === 0)) && (
            <button type="button" onClick={() => setShowAddCamion(true)} className="print:hidden inline-flex items-center gap-2 rounded-lg bg-[#FF6A3D] px-4 py-3 font-bold text-white hover:bg-[#e85b2d]">
              <Plus size={16} />
              {user?.role === 'CHAUFFEUR' ? 'Enregistrer mon camion' : 'Ajouter un camion'}
            </button>
          )}

          {mode === 'camions' && (user?.role === 'TRANSPORTEUR' || user?.role === 'ENTREPRISE') && (
            <Link to="/transporteur/suivi" className="print:hidden inline-flex items-center gap-2 self-start rounded-lg border border-[#FF6A3D] bg-white px-4 py-2.5 text-sm font-bold text-[#121C2D] hover:bg-orange-50">
              <MapPinned size={16} />
              Suivi de flotte
            </Link>
          )}

          {mode === 'historique' && <PrintButton>Imprimer l’historique</PrintButton>}

          {mode === 'chauffeurs' && page.endpoint && (user?.role === 'TRANSPORTEUR' || user?.role === 'ENTREPRISE') && (
            <div className="print:hidden flex flex-col items-end gap-2">
              <button type="button" onClick={loadItems} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-[#121C2D] hover:border-[#FF6A3D]">
                <RefreshCw size={16} />
                Actualiser
              </button>
              <button type="button" onClick={() => setShowAddChauffeur(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#FF6A3D] px-4 py-2.5 font-bold text-white hover:bg-[#e85b2d]">
                <Plus size={16} />
                Ajouter un chauffeur
              </button>
            </div>
          )}

          {page.endpoint && mode !== 'chauffeurs' && (
            <button type="button" onClick={loadItems} className="print:hidden inline-flex items-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-[#121C2D] hover:border-[#FF6A3D]">
              <RefreshCw size={16} />
              Actualiser
            </button>
          )}
        </div>

        {(mode === 'courses' || mode === 'historique' || mode === 'chauffeurs' || (mode === 'camions' && !isIndependentDriver)) && (
          <div className="print:hidden rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <Search size={18} className="text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={mode === 'camions' ? 'Rechercher un camion, une immatriculation, un trajet...' : mode === 'chauffeurs' ? 'Rechercher un chauffeur, une ville, un e-mail...' : 'Rechercher une ville, une marchandise, un client...'}
                className="w-full border-0 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none"
              />
            </div>
          </div>
        )}

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
        {success && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</div>}

        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-slate-500">Chargement...</div>
        ) : mode === 'camions' ? (
          <CamionList items={filteredItems} documents={truckDocuments} chauffeurs={fleetChauffeurs} onUpdate={loadItems} onAssignDriver={assignTruckDriver} />
        ) : mode === 'recherche' ? (
          <RechercheList items={items} query={query} onQueryChange={setQuery} camions={fleetCamions} chauffeurs={fleetChauffeurs} role={user?.role} isIndependentDriver={!user?.employeur_id} onAccept={acceptOffer} onStartNegotiation={startNegotiation} onCourseAccepted={loadItems} />
        ) : mode === 'courses' ? (
          <CourseList items={filteredItems} role={user?.role} onUpdateStatus={updateCourseStatus} />
        ) : mode === 'historique' ? (
          <CourseHistoryList items={filteredItems} />
        ) : mode === 'chauffeurs' ? (
          <ChauffeurList items={filteredItems} onUpdate={loadItems} onSuccess={setSuccess} />
        ) : (
          <DocumentManager items={filteredItems} onDelete={deleteDocument} />
        )}
      </div>
      {mode === 'camions' && showAddCamion && <AddCamionModal independentDriver={user?.role === 'CHAUFFEUR'} onClose={() => setShowAddCamion(false)} onCreated={loadItems} />}
      {mode === 'chauffeurs' && showAddChauffeur && <AddChauffeurModal onClose={() => setShowAddChauffeur(false)} onCreated={async (result) => {
        setSuccess(result.message);
        await loadItems();
      }} />}
    </DashboardLayout>
  );
}

function AddChauffeurModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ nom: '', email: '', telephone_whatsapp: '', ville: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const closeOnEscape = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await api.post('/api/auth/invite-chauffeur', form);
      await onCreated(response.data);
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible d\'inviter ce chauffeur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121C2D]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="add-chauffeur-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-8 py-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF6A3D]">Gestion de flotte</p>
            <h2 id="add-chauffeur-title" className="mt-1 text-2xl font-bold text-[#121C2D]">Ajouter un chauffeur</h2>
            <p className="mt-1 text-sm text-slate-500">Créez son compte et envoyez-lui un lien d’activation.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#121C2D]" aria-label="Fermer"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="space-y-6 p-8">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          <ModalField label="Nom complet" name="nom" value={form.nom} onChange={change} placeholder="Moussa Ndiaye" />
          <ModalField label="Adresse e-mail" name="email" value={form.email} onChange={change} type="email" placeholder="moussa@example.com" />
          <div className="grid gap-6 sm:grid-cols-2">
            <ModalField label="Téléphone (WhatsApp)" name="telephone_whatsapp" value={form.telephone_whatsapp} onChange={change} placeholder="770000000" />
            <ModalField label="Ville de résidence" name="ville" value={form.ville} onChange={change} placeholder="Dakar" />
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">Annuler</button>
            <button disabled={saving} type="submit" className="rounded-lg bg-[#FF6A3D] px-8 py-3 text-sm font-bold text-white hover:bg-[#e85b2d] disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Ajout...' : 'Ajouter le chauffeur'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddCamionModal({ onClose, onCreated, independentDriver = false }) {
  const [form, setForm] = useState({ type_vehicule: '', capacite_tonnes: '', plaque_immatriculation: '' });
  const [documents, setDocuments] = useState({ carteGriseRecto: null, carteGriseVerso: null, assurance: null, photos: [] });
  const [createdCamionId, setCreatedCamionId] = useState(null);
  const [uploadedDocumentKeys, setUploadedDocumentKeys] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const closeOnEscape = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const changeDocument = (name, event) => {
    const files = Array.from(event.target.files || []);
    if (name === 'photos' && files.length > 4) {
      setError('Vous pouvez sélectionner au maximum 4 photos du véhicule.');
      event.target.value = '';
      return;
    }
    setDocuments((current) => ({ ...current, [name]: name === 'photos' ? files.slice(0, 4) : files[0] || null }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (!documents.carteGriseRecto || !documents.carteGriseVerso || !documents.assurance || documents.photos.length === 0) {
        throw new Error('La carte grise recto/verso, l’assurance et au moins une photo du véhicule sont obligatoires.');
      }
      let camionId = createdCamionId;
      if (!camionId) {
        const camionResponse = await api.post('/api/camions', { ...form, plaque_immatriculation: form.plaque_immatriculation.trim().toUpperCase(), capacite_tonnes: Number(form.capacite_tonnes) });
        camionId = camionResponse.data?.camion?.id;
        if (!camionId) throw new Error('Le camion a été créé sans identifiant.');
        setCreatedCamionId(camionId);
      }
      const uploads = [
        ['CARTE_GRISE_RECTO', documents.carteGriseRecto, 'carteGriseRecto'],
        ['CARTE_GRISE_VERSO', documents.carteGriseVerso, 'carteGriseVerso'],
        ['ASSURANCE', documents.assurance, 'assurance'],
        ...documents.photos.map((file, index) => ['PHOTO_CAMION', file, `photo-${index}-${file.name}-${file.lastModified}`]),
      ];
      const uploadedKeys = new Set(uploadedDocumentKeys);
      for (const [type, file, key] of uploads) {
        if (uploadedKeys.has(key)) continue;
        const body = new FormData();
        body.append('document', file);
        body.append('type_document', type);
        body.append('camion_id', String(camionId));
        await api.post('/api/documents/upload', body);
        uploadedKeys.add(key);
        setUploadedDocumentKeys([...uploadedKeys]);
      }
      await onCreated();
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Impossible d’enregistrer ce camion.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121C2D]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="add-camion-title" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b border-slate-100 px-8 py-6">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF6A3D]">{independentDriver ? 'Espace chauffeur solo' : 'Gestion de flotte'}</p><h2 id="add-camion-title" className="mt-1 text-2xl font-bold text-[#121C2D]">{independentDriver ? 'Enregistrer mon camion' : 'Ajouter un camion'}</h2><p className="mt-1 text-sm text-slate-500">{independentDriver ? 'Un chauffeur indépendant peut associer un seul camion à son compte.' : 'Enregistrez un véhicule dans votre flotte.'}</p></div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-[#121C2D]" aria-label="Fermer"><X size={20} /></button>
      </div>
      <form onSubmit={submit} className="space-y-8 p-8">
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        <div className="grid gap-6 sm:grid-cols-3">
          <ModalField label="Type de véhicule" name="type_vehicule" value={form.type_vehicule} onChange={change} placeholder="Plateau, citerne, fourgon..." />
          <ModalField label="Capacité (tonnes)" name="capacite_tonnes" value={form.capacite_tonnes} onChange={change} type="number" min="0.1" step="0.1" placeholder="40" />
          <ModalField label="Plaque d’immatriculation" name="plaque_immatriculation" value={form.plaque_immatriculation} onChange={change} placeholder="DK-8899-A" />
        </div>
        <div className="border-t border-slate-100 pt-8">
          <div className="mb-6">
            <h3 className="text-lg font-bold text-[#121C2D]">Documents du véhicule</h3>
            <p className="mt-1 text-sm text-slate-500">Formats acceptés : PDF, JPG, PNG ou WEBP. Maximum 5 Mo par fichier.</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FileField label="Carte grise - recto" value={documents.carteGriseRecto} onChange={(event) => changeDocument('carteGriseRecto', event)} required />
            <FileField label="Carte grise - verso" value={documents.carteGriseVerso} onChange={(event) => changeDocument('carteGriseVerso', event)} required />
            <FileField label="Assurance du véhicule" value={documents.assurance} onChange={(event) => changeDocument('assurance', event)} required />
            <FileField label="Photos (1 à 4)" value={documents.photos} onChange={(event) => changeDocument('photos', event)} multiple maxFiles={4} required />
          </div>
        </div>
        <div className="flex flex-col-reverse gap-4 border-t border-slate-100 pt-8 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-8 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">Annuler</button>
          <button disabled={saving} type="submit" className="rounded-lg bg-[#FF6A3D] px-10 py-3 text-sm font-bold text-white hover:bg-[#e85b2d] disabled:cursor-not-allowed disabled:opacity-60">{saving ? 'Enregistrement...' : 'Enregistrer le camion'}</button>
        </div>
      </form>
    </div>
  </div>;
}

function ModalField({ label, name, value, onChange, type = 'text', min, step, placeholder }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-bold text-[#121C2D]">{label}</span><input required type={type} min={min} step={step} name={name} value={value} onChange={onChange} placeholder={placeholder} className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-[#FF6A3D] focus:ring-2 focus:ring-orange-100" /></label>;
}

function FileField({ label, value, onChange, required = false, multiple = false, maxFiles }) {
  const selectedFiles = Array.isArray(value) ? value : value ? [value] : [];
  return <label className="block rounded-lg border border-dashed border-slate-300 p-3 transition hover:border-[#FF6A3D]"><span className="mb-2 block text-xs font-bold text-[#121C2D]">{label}{required && <span className="text-[#FF6A3D]"> *</span>}</span><input required={required} multiple={multiple} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={onChange} className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#FF6A3D]" />{selectedFiles.length > 0 && <span className="mt-2 block truncate text-xs text-emerald-600">{selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} photo(s) sélectionnée(s)${maxFiles ? ` / ${maxFiles}` : ''}`}</span>}</label>;
}

function CamionList({ items, documents, chauffeurs, onUpdate, onAssignDriver }) {
  const { user } = useAuth();
  const [editingTruckId, setEditingTruckId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api.delete(`/api/camions/${pendingDelete.id}`);
      setPendingDelete(null);
      await onUpdate();
    } catch (error) {
      setDeleteError(error.response?.data?.error || 'Impossible de supprimer ce camion.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className={`grid gap-5 ${user?.role === 'CHAUFFEUR' && !user?.employeur_id ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
        {items.length ? items.map((item) => (
          <article key={item.id ?? item.immatriculation} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(390px,0.95fr)]">
            <TruckPhotoGallery
              truck={item}
              onUpdate={onUpdate}
              canManage={String(item.proprietaire_id) === String(user?.id)}
            />
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{user?.role === 'CHAUFFEUR' && String(item.proprietaire_id) === String(user.id) ? 'Mon véhicule' : 'Véhicule de la flotte'}</p>
                  <h3 className="mt-1 truncate text-xl font-bold text-[#121C2D]">{item.plaque_immatriculation || 'Camion sans immatriculation'}</h3>
                  <p className="mt-1 text-sm text-slate-500">{item.type_vehicule || 'Type non renseigné'}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${item.statut === 'DISPONIBLE' ? 'bg-emerald-100 text-emerald-700' : item.statut === 'EN_MISSION' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-700'}`}>
                  {item.statut === 'DISPONIBLE' ? 'Disponible' : item.statut === 'EN_MISSION' ? 'En mission' : 'Indisponible'}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-2 text-xs text-slate-500"><Gauge size={15} /> Capacité</div><p className="mt-1 font-bold text-[#121C2D]">{item.capacite_tonnes || '—'} <span className="text-xs font-medium text-slate-500">tonnes</span></p></div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-2 text-xs text-slate-500"><Users size={15} /> {user?.role === 'CHAUFFEUR' ? 'Affectation' : 'Chauffeur'}</div><p className="mt-1 truncate text-sm font-bold text-[#121C2D]">{user?.role === 'CHAUFFEUR' ? String(item.proprietaire_id) === String(user.id) ? 'Camion personnel' : 'Camion attribué' : item.chauffeur_nom || 'Non affecté'}</p></div>
              </div>
              {(user?.role === 'TRANSPORTEUR' || user?.role === 'ENTREPRISE') && String(item.proprietaire_id) === String(user.id) && (
                <div className="mt-4">
                  {chauffeurs.length ? (
                    <label className="flex items-center gap-3">
                      <span className="shrink-0 text-xs font-semibold text-slate-500">Chauffeur</span>
                      <select
                        aria-label={`Chauffeur du camion ${item.plaque_immatriculation}`}
                        value={item.chauffeur_id || ''}
                        onChange={(event) => onAssignDriver(item.id, event.target.value)}
                        disabled={item.statut === 'EN_MISSION'}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-[#121C2D] outline-none transition focus:border-[#FF6A3D] focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        <option value="">Non affecté</option>
                        {chauffeurs.map((driver) => <option key={driver.id} value={driver.id}>{driver.nom}</option>)}
                      </select>
                    </label>
                  ) : (
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500">Aucun chauffeur dans votre flotte</span>
                      <Link to="/transporteur/chauffeurs" className="shrink-0 font-semibold text-[#d94f2b] hover:underline">Ajouter un chauffeur</Link>
                    </div>
                  )}
                  {item.statut === 'EN_MISSION' && <p className="mt-1.5 text-[11px] text-slate-400">Modification indisponible pendant une mission.</p>}
                </div>
              )}
              <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><MapPin size={14} className="text-[#FF6A3D]" /> Enregistré le {item.date_ajout ? new Date(item.date_ajout).toLocaleDateString('fr-FR') : '—'}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
                <div><span className="block text-xs text-slate-500">Identifiant</span><strong>#{item.id}</strong></div>
                <div><span className="block text-xs text-slate-500">Immatriculation</span><strong>{item.plaque_immatriculation || 'Non renseignée'}</strong></div>
                <div><span className="block text-xs text-slate-500">Type</span><strong>{item.type_vehicule || 'Non renseigné'}</strong></div>
                <div><span className="block text-xs text-slate-500">Photos</span><strong>{item.photos?.length || 0} / 4</strong></div>
              </div>
              {user?.role === 'CHAUFFEUR' && String(item.proprietaire_id) === String(user.id) && (
                <TruckPaperSection truck={item} documents={documents} onUpdate={onUpdate} />
              )}
              {editingTruckId === item.id && <EditTruckForm truck={item} onCancel={() => setEditingTruckId(null)} onSaved={async () => { setEditingTruckId(null); await onUpdate(); }} />}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                <span className="text-xs font-semibold text-slate-500">Gestion du véhicule</span>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <StatusButton camion={item} onStatusChange={onUpdate} />
                  {user?.role === 'CHAUFFEUR' && !user?.employeur_id && String(item.proprietaire_id) === String(user.id) && (
                    <button type="button" disabled={item.statut === 'EN_MISSION'} title={item.statut === 'EN_MISSION' ? 'Terminez ou déclinez la mission avant de modifier le camion.' : 'Modifier les informations du camion'} onClick={() => setEditingTruckId(editingTruckId === item.id ? null : item.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#121C2D] hover:border-[#FF6A3D] disabled:cursor-not-allowed disabled:opacity-50">
                      <Pencil size={14} /> {editingTruckId === item.id ? 'Fermer la configuration' : 'Modifier les informations'}
                    </button>
                  )}
                  {user?.role !== 'CHAUFFEUR' && <button type="button" onClick={() => { setDeleteError(''); setPendingDelete(item); }} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50" aria-label={`Supprimer le camion ${item.plaque_immatriculation}`}><Trash2 size={14} /> Supprimer</button>}
                </div>
              </div>
            </div>
          </article>
        )) : <EmptyState icon={Truck} text={user?.role === 'CHAUFFEUR' ? 'Aucun camion ne vous est assigné pour le moment.' : 'Aucun camion enregistré. Ajoutez votre premier véhicule pour publier une disponibilité.'} />}
      </div>
      <ConfirmDialog open={Boolean(pendingDelete)} title="Supprimer ce camion ?" message={pendingDelete ? `Le camion ${pendingDelete.plaque_immatriculation} sera retiré de votre flotte. Les camions associés à une course ne peuvent pas être supprimés afin de préserver l’historique.` : ''} confirmLabel="Supprimer le camion" busy={deleting} errorMessage={deleteError} onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />
    </>
  );
}

const TRUCK_PAPER_TYPES = [
  { type: 'CARTE_GRISE_RECTO', label: 'Carte grise · recto', vehicle: true },
  { type: 'CARTE_GRISE_VERSO', label: 'Carte grise · verso', vehicle: true },
  { type: 'ASSURANCE', label: 'Assurance du véhicule', vehicle: true },
  { type: 'PERMIS', label: 'Permis de conduire chauffeur', vehicle: false },
];

function TruckPaperSection({ truck, documents, onUpdate }) {
  const [uploadingType, setUploadingType] = useState('');
  const [error, setError] = useState('');
  const [previewDocument, setPreviewDocument] = useState(null);
  const truckDocuments = documents.filter((document) => (
    String(document.camion_id) === String(truck.id) && document.type_document !== 'PHOTO_CAMION'
  ));
  const profileDocuments = documents.filter((document) => !document.camion_id);

  useEffect(() => {
    if (!previewDocument) return undefined;
    const closeOnEscape = (event) => event.key === 'Escape' && setPreviewDocument(null);
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [previewDocument]);

  const uploadPaper = async (event, paper, existingDocument) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploadingType(paper.type);
    setError('');
    try {
      const body = new FormData();
      body.append('document', file);
      body.append('type_document', paper.type);
      if (paper.vehicle) body.append('camion_id', String(truck.id));
      const response = await api.post('/api/documents/upload', body);
      if (existingDocument?.id) await api.delete(`/api/documents/${existingDocument.id}`);
      if (!response.data?.document) throw new Error('Le document n’a pas été enregistré.');
      await onUpdate();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || 'Impossible d’envoyer ce document.');
    } finally {
      setUploadingType('');
    }
  };

  const previewUrl = previewDocument ? resolveMediaUrl(previewDocument.fichier_url) : '';
  const isPreviewImage = /\.(jpg|jpeg|png|webp)$/i.test(previewDocument?.fichier_url || '');

  return <>
    <section className="mt-5 space-y-3 border-t border-slate-100 pt-5">
    <div className="flex items-end justify-between gap-3">
      <div><h4 className="font-bold text-[#121C2D]">Papiers du véhicule et du chauffeur</h4><p className="mt-1 text-xs text-slate-500">Déposez les pièces et suivez leur validation.</p></div>
      <FileText size={18} className="shrink-0 text-slate-400" />
    </div>
    {error && <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      {TRUCK_PAPER_TYPES.map((paper) => {
        const sourceDocuments = paper.vehicle ? truckDocuments : profileDocuments;
        const document = sourceDocuments.find((item) => item.type_document === paper.type);
        const status = document?.statut || '';
        const StatusIcon = status === 'VALIDE' ? CheckCircle2 : status === 'REFUSE' ? CircleAlert : Clock3;
        const statusStyle = status === 'VALIDE' ? 'text-emerald-700' : status === 'REFUSE' ? 'text-rose-700' : 'text-amber-700';

        return <article key={paper.type} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><p className="truncate text-xs font-bold text-[#121C2D]">{paper.label}</p><p className={`mt-1 flex items-center gap-1 text-[10px] font-semibold ${status ? statusStyle : 'text-slate-400'}`}>
              {status ? <StatusIcon size={12} /> : <Upload size={12} />}
              {status ? status.replace('_', ' ') : 'À fournir'}
            </p></div>
            <label className="shrink-0 cursor-pointer rounded-md border border-slate-200 px-2 py-1.5 text-[10px] font-bold text-slate-700 hover:border-[#FF6A3D]">
              {uploadingType === paper.type ? 'Envoi...' : document ? 'Remplacer' : 'Ajouter'}
              <input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={(event) => uploadPaper(event, paper, document)} disabled={Boolean(uploadingType)} className="sr-only" />
            </label>
          </div>
          {document?.fichier_url && <button type="button" onClick={() => setPreviewDocument(document)} className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-[#0f766e] underline underline-offset-2 hover:text-[#0b5e57]">Consulter le document</button>}
          {status === 'REFUSE' && document.motif_refus && <p className="mt-2 text-[10px] leading-4 text-rose-700">Motif : {document.motif_refus}</p>}
        </article>;
      })}
    </div>
    </section>
    {previewDocument && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#121C2D]/75 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={`Aperçu : ${previewDocument.type_document}`} onMouseDown={(event) => event.target === event.currentTarget && setPreviewDocument(null)}>
      <section className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-widest text-[#FF6A3D]">Document du véhicule</p><h2 className="mt-0.5 truncate text-sm font-bold text-[#121C2D] sm:text-base">{TRUCK_PAPER_TYPES.find((paper) => paper.type === previewDocument.type_document)?.label || previewDocument.type_document}</h2></div>
          <button type="button" onClick={() => setPreviewDocument(null)} aria-label="Fermer l’aperçu" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-[#121C2D]"><X size={18} /></button>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-3 sm:p-5">
          {isPreviewImage ? <img src={previewUrl} alt={previewDocument.type_document} className="max-h-[78vh] max-w-full rounded-md object-contain shadow-sm" /> : <iframe title={previewDocument.type_document} src={previewUrl} className="h-[78vh] w-full rounded-md bg-white" />}
        </div>
      </section>
    </div>}
  </>;
}

function TruckPhotoGallery({ truck, onUpdate, canManage }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [error, setError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const photos = Array.isArray(truck.photos) ? truck.photos : [];
  const activePhoto = photos[activeIndex];

  const uploadPhotos = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (photos.length + files.length > 4) {
      setError(`Maximum 4 photos par camion. Il reste ${Math.max(0, 4 - photos.length)} emplacement(s).`);
      return;
    }

    setUploading(true);
    setError('');
    try {
      for (const file of files) {
        const body = new FormData();
        body.append('document', file);
        body.append('type_document', 'PHOTO_CAMION');
        body.append('camion_id', String(truck.id));
        await api.post('/api/documents/upload', body);
      }
      setActiveIndex(0);
      await onUpdate();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible d’ajouter la photo du camion.');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    if (!photoToDelete) return;
    setDeletingPhoto(true);
    setDeleteError('');
    try {
      await api.delete(`/api/documents/${photoToDelete.id}`);
      const remainingPhotos = photos.length - 1;
      setActiveIndex((index) => (remainingPhotos ? index % remainingPhotos : 0));
      setImageFailed(false);
      setPhotoToDelete(null);
      await onUpdate();
    } catch (requestError) {
      setDeleteError(requestError.response?.data?.error || 'Impossible de supprimer cette photo.');
    } finally {
      setDeletingPhoto(false);
    }
  };

  return <>
    <div className="group relative h-60 overflow-hidden bg-gradient-to-br from-[#142d3c] via-[#16635b] to-[#dce9e5] sm:h-72 lg:h-full lg:min-h-[430px]">
      {activePhoto && !imageFailed ? (
        <img
          src={resolveMediaUrl(activePhoto.fichier_url)}
          alt={`Photo ${activeIndex + 1} du camion ${truck.plaque_immatriculation || ''}`}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.18),transparent_45%)] text-white">
          <div className="grid h-16 w-16 place-items-center rounded-2xl border border-white/25 bg-white/10"><Truck size={34} strokeWidth={1.5} /></div>
          <div className="text-center"><p className="font-bold">{imageFailed ? 'Photo indisponible' : 'Votre camion, en image'}</p><p className="mt-1 text-xs text-white/75">{imageFailed ? 'Vérifiez le fichier ou ajoutez une nouvelle photo.' : 'Ajoutez jusqu’à 4 photos du véhicule.'}</p></div>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#101c2b]/60 to-transparent" />
      <div className="absolute left-4 top-4 rounded-full border border-white/30 bg-[#121C2D]/70 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
        {photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : 'Photo du véhicule'}
      </div>
      {photos.length > 1 && (
        <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3 opacity-100 sm:opacity-0 sm:transition group-hover:opacity-100">
          <button type="button" aria-label="Photo précédente" onClick={() => { setImageFailed(false); setActiveIndex((activeIndex - 1 + photos.length) % photos.length); }} className="grid h-9 w-9 place-items-center rounded-full border border-white/50 bg-[#121C2D]/65 text-white backdrop-blur-sm"><ChevronLeft size={19} /></button>
          <button type="button" aria-label="Photo suivante" onClick={() => { setImageFailed(false); setActiveIndex((activeIndex + 1) % photos.length); }} className="grid h-9 w-9 place-items-center rounded-full border border-white/50 bg-[#121C2D]/65 text-white backdrop-blur-sm"><ChevronRight size={19} /></button>
        </div>
      )}
      {canManage && <div className="absolute bottom-3 right-3 flex items-center gap-2">
        {activePhoto && <button type="button" onClick={() => { setDeleteError(''); setPhotoToDelete(activePhoto); }} aria-label="Supprimer cette photo" title="Supprimer cette photo" className="grid h-9 w-9 place-items-center rounded-lg border border-white/40 bg-rose-600/90 text-white shadow-lg transition hover:bg-rose-700"><Trash2 size={15} /></button>}
        {photos.length < 4 && <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/40 bg-white/95 px-3 py-2 text-xs font-bold text-[#121C2D] shadow-lg transition hover:bg-white">
          <Camera size={15} /> {uploading ? 'Envoi...' : 'Ajouter une photo'}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={uploadPhotos} disabled={uploading} className="sr-only" />
        </label>}
      </div>}
    </div>
    {error && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs text-rose-700">{error}</p>}
    <ConfirmDialog open={Boolean(photoToDelete)} title="Supprimer cette photo ?" message="Cette photo sera retirée du camion. Vous pourrez en ajouter une autre à sa place." confirmLabel="Supprimer la photo" busy={deletingPhoto} errorMessage={deleteError} onCancel={() => setPhotoToDelete(null)} onConfirm={removePhoto} />
  </>;
}

function EditTruckForm({ truck, onCancel, onSaved }) {
  const [form, setForm] = useState({
    type_vehicule: truck.type_vehicule || '',
    capacite_tonnes: truck.capacite_tonnes || '',
    plaque_immatriculation: truck.plaque_immatriculation || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.put(`/api/camions/${truck.id}`, {
        ...form,
        capacite_tonnes: Number(form.capacite_tonnes),
      });
      await onSaved();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de modifier le camion.');
    } finally {
      setSaving(false);
    }
  };

  return <form onSubmit={submit} className="mt-5 space-y-4 rounded-xl border border-orange-100 bg-orange-50/50 p-4">
      <div><p className="text-xs font-bold uppercase tracking-widest text-[#FF6A3D]">Configuration sur cette page</p><h4 className="mt-1 font-bold text-[#121C2D]">Modifier les informations du camion</h4></div>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <ModalField label="Type de véhicule" name="type_vehicule" value={form.type_vehicule} onChange={updateField} placeholder="Plateau, citerne, fourgon..." />
        <ModalField label="Capacité (tonnes)" name="capacite_tonnes" value={form.capacite_tonnes} onChange={updateField} type="number" min="0.1" step="0.1" placeholder="40" />
        <div className="sm:col-span-2"><ModalField label="Plaque d’immatriculation" name="plaque_immatriculation" value={form.plaque_immatriculation} onChange={updateField} placeholder="DK-8899-A" /></div>
      </div>
      <div className="flex flex-col-reverse gap-3 border-t border-orange-100 pt-4 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Annuler</button>
        <button type="submit" disabled={saving} className="rounded-lg bg-[#FF6A3D] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#e85b2d] disabled:opacity-60">{saving ? 'Enregistrement...' : 'Enregistrer les informations'}</button>
      </div>
    </form>;
}

function RechercheList({ items, query, onQueryChange, camions, chauffeurs, role, isIndependentDriver, onAccept, onStartNegotiation, onCourseAccepted }) {
  const [villeDepart, setVilleDepart] = useState('');
  const [villeDestination, setVilleDestination] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [offerAction, setOfferAction] = useState('accept');
  const [negotiationConversation, setNegotiationConversation] = useState(null);
  const [detailsOffer, setDetailsOffer] = useState(null);
  const [acceptanceBlockReason, setAcceptanceBlockReason] = useState('');
  const [camionId, setCamionId] = useState('');
  const [chauffeurId, setChauffeurId] = useState('');
  const [saving, setSaving] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const availableCamions = camions.filter((truck) => truck.statut === 'DISPONIBLE');
  const selectedDeparture = westAfricanCities.find((city) => city.name === villeDepart);
  const selectedDestination = westAfricanCities.find((city) => city.name === villeDestination);
  const route = selectedDeparture && selectedDestination
    ? [[selectedDeparture.lng, selectedDeparture.lat], [selectedDestination.lng, selectedDestination.lat]]
    : [];
  const normalizedQuery = query.trim().toLocaleLowerCase('fr');
  const filteredOffers = items.filter((item) => {
    const matchesText = !normalizedQuery || JSON.stringify(item).toLocaleLowerCase('fr').includes(normalizedQuery);
    const matchesDeparture = !villeDepart || matchesCity(item.ville_depart, villeDepart);
    const matchesDestination = !villeDestination || matchesCity(item.ville_arrivee, villeDestination);
    return matchesText && matchesDeparture && matchesDestination;
  });

  const getAcceptanceBlockReason = () => {
    if (!availableCamions.length) {
      return 'Aucun camion disponible dans votre flotte. Ajoutez ou activez un camion pour accepter une annonce.';
    }
    if (role !== 'CHAUFFEUR' && !chauffeurs.length) {
      return 'Aucun chauffeur n’est associé à votre flotte. Ajoutez un chauffeur avant d’accepter une annonce.';
    }
    return '';
  };

  const openOfferAction = (offer, action) => {
    const blockReason = getAcceptanceBlockReason();
    setAcceptError('');
    setAcceptanceBlockReason(blockReason);
    if (blockReason) return;
    setOfferAction(action);
    setCamionId('');
    setChauffeurId('');
    setSelectedOffer(offer);
  };

  const submitAcceptance = async (event) => {
    event.preventDefault();
    if (!selectedOffer || !camionId) return;
    setSaving(true);
    setAcceptError('');
    try {
      const details = { demandeId: selectedOffer.id, camionId, chauffeurId: role === 'CHAUFFEUR' ? undefined : chauffeurId };
      if (offerAction === 'negotiate') {
        const conversation = await onStartNegotiation(details);
        setNegotiationConversation(conversation);
      } else {
        await onAccept(details);
      }
      setSelectedOffer(null);
    } catch (error) {
      setAcceptError(error.response?.data?.error || error.message || 'Impossible d’accepter cette offre.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.65fr)]">
        <section className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-orange-50 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] sm:p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Recherche de chargement</p>
            <h2 className="mt-1 text-lg font-bold text-[#121C2D]">Choisissez votre itinéraire</h2>
            <p className="mt-1 text-sm leading-5 text-slate-500">Filtrez les demandes selon votre trajet et votre camion.</p>
          </div>
          <div className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Départ</span>
            <CitySelect value={villeDepart} onChange={setVilleDepart} options={westAfricanCities} placeholder="Toutes les villes de départ" className="w-full" />
          </div>
          <div className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Destination</span>
            <CitySelect value={villeDestination} onChange={setVilleDestination} options={westAfricanCities} placeholder="Toutes les destinations" className="w-full" />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Marchandise ou chargeur</span>
            <span className="flex min-h-[50px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 focus-within:border-[#FF6A3D] focus-within:ring-2 focus-within:ring-orange-100">
              <Search size={17} className="shrink-0 text-slate-400" />
              <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Ex. ciment, riz, nom du client" className="w-full border-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
            </span>
          </label>
          <button type="button" onClick={() => setHasSearched(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6A3D] to-[#ff8a55] px-5 py-2.5 text-sm font-bold text-white shadow-[0_12px_24px_rgba(255,106,61,0.24)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_28px_rgba(255,106,61,0.32)]">
            <Search size={16} /> Rechercher des chargements
          </button>
        </section>

        <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-[0_20px_45px_rgba(15,23,42,0.1)] sm:p-5">
          {hasSearched ? (
            <>
              <header className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Chargements disponibles</p>
                  <h2 className="mt-1 flex flex-wrap items-center gap-2 text-base font-bold text-[#121C2D] sm:text-lg">
                    <span>{villeDepart || 'Toutes les villes'}</span><ArrowLeftRight size={15} className="text-[#FF6A3D]" /><span>{villeDestination || 'Toutes les destinations'}</span>
                  </h2>
                </div>
                <span className="w-fit rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800">
                  {filteredOffers.length} demande{filteredOffers.length === 1 ? '' : 's'}
                </span>
              </header>
              {filteredOffers.length ? <div className="grid gap-4 md:grid-cols-2">{filteredOffers.map((item) => (
        <article key={item.id} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_16px_32px_rgba(15,23,42,0.1)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-[#121C2D]">{item.chargeur_nom || 'Chargeur'}</h3>
              <p className="mt-1 text-xs text-slate-500">Publié le {formatDateTime(item.date_creation)}</p>
            </div>
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[10px] font-bold uppercase text-orange-800">
              {item.prix_propose ? `${Number(item.prix_propose).toLocaleString('fr-FR')} FCFA` : 'Prix non défini'}
            </span>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><MapPin size={16} className="shrink-0 text-[#FF6A3D]" /><span>{item.ville_depart || 'Départ'}</span></div>
            <div className="ml-[7px] h-4 border-l border-dashed border-slate-300" />
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><MapPin size={16} className="shrink-0 text-emerald-600" /><span>{item.ville_arrivee || 'Arrivée'}</span></div>
          </div>

          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>Marchandise : {item.nature_marchandise || '-'}</p>
            <p>Type requis : {item.type_camion_requis || '-'}</p>
            <p>Chargement : {formatDate(item.date_chargement)}</p>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <span className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800">{item.tonnage || 0} tonnes</span>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setDetailsOffer(item)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#121C2D] hover:border-[#FF6A3D]"><MapPin size={14} /> Détails et position</button>
              <ActionsMenu label={`Autres actions pour ${item.chargeur_nom || 'cette offre'}`}>
                {item.contact && <a href="#" onClick={(event) => { event.preventDefault(); contactChargeur(item.id); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><MessageCircle size={15} /> WhatsApp</a>}
                {(role === 'TRANSPORTEUR' || role === 'ENTREPRISE' || (role === 'CHAUFFEUR' && isIndependentDriver)) && <button type="button" onClick={() => openOfferAction(item, 'negotiate')} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><MessageCircle size={15} /> Négocier le prix</button>}
              </ActionsMenu>
              {(role === 'TRANSPORTEUR' || role === 'ENTREPRISE' || (role === 'CHAUFFEUR' && isIndependentDriver)) && (
                <button type="button" onClick={() => openOfferAction(item, 'accept')} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#FF6A3D] to-[#ff8a55] px-3 py-2 text-xs font-bold text-white hover:shadow-md"><Truck size={14} />Accepter l’offre</button>
              )}
            </div>
          </div>
        </article>
      ))}</div> : <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/80 px-5 py-10 text-center">
                <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#fff1e8] text-[#e85b2d]"><Search size={23} /></div>
                <h3 className="text-base font-bold text-[#121C2D]">Aucun chargement trouvé</h3>
                <p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">Aucune demande ne correspond à cet itinéraire. Essayez d’élargir votre recherche ou revenez plus tard.</p>
              </div>}
            </>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff1e8] text-[#e85b2d]"><MapPin size={19} /></div>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Aperçu des trajets</p><h2 className="text-base font-bold text-[#121C2D]">Les demandes de chargement, près de vous</h2></div>
              </div>
              <RouteMap route={route} focusRoute={Boolean(route.length)} showControls={false} className="h-[420px]" />
              <p className="mt-3 text-center text-xs text-slate-500">Choisissez un départ et une destination, puis lancez la recherche pour voir les offres correspondantes.</p>
            </>
          )}
        </section>
      </div>
      {selectedOffer && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121C2D]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="accept-offer-title" onMouseDown={(event) => event.target === event.currentTarget && !saving && setSelectedOffer(null)}><form onSubmit={submitAcceptance} className="w-full max-w-lg space-y-5 rounded-xl bg-white p-6 shadow-2xl"><header><p className="text-xs font-bold uppercase tracking-widest text-[#FF6A3D]">{offerAction === 'negotiate' ? 'Négociation de prix' : 'Affectation de flotte'}</p><h2 id="accept-offer-title" className="mt-1 text-xl font-bold text-[#121C2D]">{offerAction === 'negotiate' ? 'Choisir le camion pour négocier' : 'Accepter cette offre'}</h2><p className="mt-1 text-sm text-slate-500">{selectedOffer.ville_depart} → {selectedOffer.ville_arrivee}</p></header>{acceptError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{acceptError}</p>}<label className="block"><span className="mb-1.5 block text-sm font-bold text-[#121C2D]">Camion disponible</span><select required value={camionId} onChange={(event) => { const nextTruckId = event.target.value; const selectedTruck = availableCamions.find((truck) => String(truck.id) === nextTruckId); setCamionId(nextTruckId); setChauffeurId(selectedTruck?.chauffeur_id ? String(selectedTruck.chauffeur_id) : ''); }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3"><option value="">Choisir un camion</option>{availableCamions.map((truck) => <option key={truck.id} value={truck.id}>{truck.plaque_immatriculation} · {truck.type_vehicule} · {truck.capacite_tonnes} t</option>)}</select></label>{role !== 'CHAUFFEUR' && <label className="block"><span className="mb-1.5 block text-sm font-bold text-[#121C2D]">Chauffeur affecté</span><select required value={chauffeurId} onChange={(event) => setChauffeurId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3"><option value="">Choisir un chauffeur</option>{chauffeurs.map((driver) => <option key={driver.id} value={driver.id}>{driver.nom} · {driver.telephone_whatsapp}</option>)}</select></label>}<p className="rounded-lg bg-orange-50 p-3 text-xs leading-5 text-orange-900">{offerAction === 'negotiate' ? 'Vous pourrez échanger en temps réel et proposer un prix. Si le chargeur accepte, le prix devient officiel et ce camion est automatiquement affecté.' : 'À l’acceptation, l’offre est réservée, le camion passe « En mission » et le chauffeur reçoit les informations du chargement. Une avance de 50 % doit être validée avant le démarrage.'}</p><div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setSelectedOffer(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600">Annuler</button><button type="submit" disabled={saving || !availableCamions.length || (role !== 'CHAUFFEUR' && !chauffeurId)} className="rounded-lg bg-[#FF6A3D] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Traitement…' : offerAction === 'negotiate' ? 'Ouvrir le chat' : 'Confirmer l’affectation'}</button></div></form></div>}
      {detailsOffer && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121C2D]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="offer-details-title" onMouseDown={(event) => event.target === event.currentTarget && setDetailsOffer(null)}><section className="max-h-[92vh] w-full max-w-3xl space-y-5 overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-6"><header className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-[#FF6A3D]">Détails de l’offre</p><h2 id="offer-details-title" className="mt-1 text-xl font-bold text-[#121C2D]">{detailsOffer.nature_marchandise || 'Marchandise'} · {detailsOffer.tonnage || 0} tonnes</h2><p className="mt-1 text-sm text-slate-500">{detailsOffer.ville_depart} → {detailsOffer.ville_arrivee}</p></div><button type="button" onClick={() => setDetailsOffer(null)} aria-label="Fermer les détails" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Fermer</button></header><div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2"><p><strong>Annonceur :</strong> {detailsOffer.chargeur_nom || 'Chargeur'}</p><p><strong>Type de camion :</strong> {detailsOffer.type_camion_requis || 'Non précisé'}</p><p><strong>Date prévue :</strong> {detailsOffer.date_chargement ? new Date(detailsOffer.date_chargement).toLocaleDateString('fr-FR') : 'Non précisée'}</p><p><strong>Prix proposé :</strong> {detailsOffer.prix_propose ? `${Number(detailsOffer.prix_propose).toLocaleString('fr-FR')} FCFA` : 'À discuter'}</p><p className="sm:col-span-2"><strong>Quartier ou repère :</strong> {detailsOffer.quartier_chargement || 'Non renseigné'}</p></div>{detailsOffer.position_lng != null && detailsOffer.position_lat != null ? <DemandLocationMap coordinates={[Number(detailsOffer.position_lng), Number(detailsOffer.position_lat)]} neighborhood={detailsOffer.quartier_chargement} readOnly height={320} /> : <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">L’annonceur n’a pas renseigné de coordonnées cartographiques pour cette offre.</p>}<p className="text-xs text-slate-500">Coordonnées : {detailsOffer.position_lat != null && detailsOffer.position_lng != null ? `${Number(detailsOffer.position_lat).toFixed(6)}, ${Number(detailsOffer.position_lng).toFixed(6)}` : 'Indisponibles'}</p></section></div>}
      {negotiationConversation && <NegotiationChatDialog conversation={negotiationConversation} onClose={() => setNegotiationConversation(null)} onCourseAccepted={onCourseAccepted} />}
      {acceptanceBlockReason && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#121C2D]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="acceptance-block-title"><div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-5 shadow-2xl"><div><p className="text-xs font-bold uppercase tracking-widest text-amber-700">Prérequis manquants</p><h2 id="acceptance-block-title" className="mt-1 text-lg font-bold text-[#121C2D]">Pourquoi tu ne peux pas accepter ?</h2></div><p className="text-sm text-slate-600">{acceptanceBlockReason}</p><ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">{!availableCamions.length && <li>Ajouter ou activer un camion disponible dans votre flotte.</li>}{role !== 'CHAUFFEUR' && !chauffeurs.length && <li>Associer un chauffeur à votre flotte.</li>}</ul><div className="flex justify-end"><button type="button" onClick={() => setAcceptanceBlockReason('')} className="rounded-lg bg-[#FF6A3D] px-4 py-2 text-sm font-bold text-white hover:bg-[#e85b2d]">Compris</button></div></div></div>}
    </>
  );
}

async function contactChargeur(demandeId) {
  try {
    const response = await api.get(`/api/annonces/whatsapp-link/demande/${demandeId}`);
    if (response.data?.link) window.open(response.data.link, '_blank', 'noopener,noreferrer');
  } catch {
    window.alert('Le contact WhatsApp est indisponible pour cette demande.');
  }
}

function matchesCity(value, selectedCity) {
  const normalize = (text) => String(text || '')
    .split(',')[0]
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('fr');
  const city = normalize(selectedCity);
  return !city || normalize(value) === city;
}

function CourseList({ items, role, onUpdateStatus }) {
  const [returnSuggestionsFor, setReturnSuggestionsFor] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const fetchSuggestions = async (ville_arrivee, courseId) => {
    if (returnSuggestionsFor === courseId) {
      setReturnSuggestionsFor(null);
      return;
    }
    setReturnSuggestionsFor(courseId);
    setLoadingSuggestions(true);
    try {
      const response = await api.get(`/api/annonces/demandes/suggestions?ville_actuelle=${ville_arrivee}`);
      setSuggestions(Array.isArray(response.data) ? response.data : []);
    } catch {
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const contactChargeur = async (demandeId) => {
    try {
      const response = await api.get(`/api/annonces/whatsapp-link/demande/${demandeId}`);
      if (response.data?.link) {
        window.open(response.data.link, '_blank');
      } else {
        alert('Impossible de générer le lien WhatsApp.');
      }
    } catch (err) {
      alert('Erreur lors de la génération du lien.');
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Trajet</th><th className="px-5 py-3">Chargeur</th><th className="px-5 py-3">Date</th><th className="px-5 py-3">Montant</th><th className="px-5 py-3">Statut</th><th className="px-5 py-3">Action</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{items.map((item) => {
          const completed = ['LIVREE', 'TERMINEE', 'SOLDE_REGLE'].includes(item.statut);
          const statusClass = completed ? 'bg-emerald-50 text-emerald-700' : item.statut === 'CHARGEMENT' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700';
          return <React.Fragment key={item.id}>
            <tr>
              <td className="px-5 py-4 font-bold text-[#121C2D]">{item.ville_depart || 'Départ'} → {item.ville_arrivee || 'Arrivée'}</td>
              <td className="px-5 py-4 text-slate-600">{item.chargeur_nom || 'Inconnu'}</td>
              <td className="px-5 py-4 text-slate-600">{item.date_creation ? new Date(item.date_creation).toLocaleDateString('fr-FR') : '—'}</td>
              <td className="px-5 py-4 font-semibold text-[#121C2D]">{item.prix_propose ? `${Number(item.prix_propose).toLocaleString('fr-FR')} FCFA` : '—'}</td>
              <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${statusClass}`}>{item.statut || 'Inconnu'}</span></td>
              <td className="px-5 py-4"><div className="flex flex-wrap items-center gap-2">
                {completed && <button type="button" onClick={() => fetchSuggestions(item.ville_arrivee, item.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">{returnSuggestionsFor === item.id ? 'Masquer les retours' : 'Trajets retour'}</button>}
                {role === 'CHAUFFEUR' && item.statut === 'CAMION_TROUVE' && item.paiement_statut_avance === 'VALIDE' && <button type="button" onClick={() => onUpdateStatus(item.id, 'CHARGEMENT')} className="rounded-lg bg-[#121C2D] px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Démarrer</button>}
                {role === 'CHAUFFEUR' && item.statut === 'CAMION_TROUVE' && item.paiement_statut_avance !== 'VALIDE' && <span className="text-xs text-amber-700">Avance à valider</span>}
                {role === 'CHAUFFEUR' && item.statut === 'CHARGEMENT' && <button type="button" onClick={() => onUpdateStatus(item.id, 'LIVRAISON')} className="rounded-lg bg-[#121C2D] px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Terminer le chargement</button>}
                {role === 'CHAUFFEUR' && item.statut === 'LIVRAISON' && <button type="button" onClick={() => onUpdateStatus(item.id, 'LIVREE')} className="rounded-lg bg-[#121C2D] px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Notifier la livraison</button>}
                {['ENTREPRISE', 'TRANSPORTEUR'].includes(role) && item.statut === 'LIVREE' && <button type="button" onClick={() => onUpdateStatus(item.id, 'TERMINEE')} className="rounded-lg bg-[#121C2D] px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Confirmer et libérer</button>}
              </div></td>
            </tr>
            {returnSuggestionsFor === item.id && <tr><td colSpan={6} className="bg-slate-50 px-5 py-4">
              <h4 className="mb-3 text-sm font-bold text-[#121C2D]">Suggestions d’offres depuis {item.ville_arrivee}</h4>
              {loadingSuggestions ? <p className="text-xs text-slate-500">Recherche...</p> : suggestions.length > 0 ? <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">{suggestions.map((sug) => <div key={sug.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm font-bold text-[#121C2D]">{sug.ville_depart} → {sug.ville_arrivee}</p><p className="text-xs text-slate-500">{sug.nature_marchandise} ({sug.tonnage} t)</p></div><button type="button" onClick={() => contactChargeur(sug.id)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><MessageCircle size={14} /> Répondre</button></div>)}</div> : <p className="text-xs text-slate-500">Aucune offre disponible au départ de cette ville.</p>}
            </td></tr>}
          </React.Fragment>;
        })}</tbody>
      </table></div> : <div className="p-8"><EmptyState icon={History} text="Aucune course dans vos dossiers." /></div>}
    </div>
  );
}

function CourseHistoryList({ items }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 text-xs font-bold uppercase text-slate-500">
        <span>{items.length} transport{items.length > 1 ? 's' : ''} terminé{items.length > 1 ? 's' : ''}</span>
        <span>Les courses sont conservées pour le suivi</span>
      </div>
      {items.length ? items.map((item) => (
        <article key={item.id} className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 font-bold text-[#121C2D]">
              <span>{item.ville_depart || 'Départ non renseigné'}</span>
              <ArrowLeftRight size={15} className="text-[#FF6A3D]" />
              <span>{item.ville_arrivee || 'Arrivée non renseignée'}</span>
              <span className="text-xs font-normal text-slate-400">#{item.id}</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">{item.nature_marchandise || 'Marchandise non renseignée'} · {item.tonnage || '-'} tonnes · Camion {item.plaque_immatriculation || 'non renseigné'}</p>
            <p className="mt-1 text-xs text-slate-500">Livré le {formatDate(item.date_livraison_reelle || item.date_creation)}{item.date_chargement ? ` · Chargement prévu le ${formatDate(item.date_chargement)}` : ''}</p>
          </div>
          <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Réglé</span>
            <strong className="text-sm text-[#121C2D]">{item.prix_propose ? `${Number(item.prix_propose).toLocaleString('fr-FR')} FCFA` : 'Montant non renseigné'}</strong>
          </div>
        </article>
      )) : <EmptyState icon={History} text="Aucun transport terminé pour le moment." />}
    </section>
  );
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

function ChauffeurList({ items, onUpdate, onSuccess }) {
  const [statusFilter, setStatusFilter] = useState('TOUS');
  const [expandedDriverId, setExpandedDriverId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const updateStatus = async () => {
    if (!pendingStatus) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.put(`/api/auth/chauffeurs/${pendingStatus.id}/status`, {
        statut: pendingStatus.status,
      });
      setPendingStatus(null);
      onSuccess(response.data.message);
      await onUpdate();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de modifier le statut de ce chauffeur.');
    } finally {
      setBusy(false);
    }
  };

  const deleteDriver = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    setError('');
    try {
      const response = await api.delete(`/api/auth/chauffeurs/${pendingDelete.id}`);
      setPendingDelete(null);
      onSuccess(response.data.message);
      await onUpdate();
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de supprimer ce compte chauffeur.');
    } finally {
      setBusy(false);
    }
  };

  const visibleItems = items.filter((item) => statusFilter === 'TOUS' || (item.statut_verification || 'VALIDE') === statusFilter);
  const activeCount = items.filter((item) => (item.statut_verification || 'VALIDE') === 'VALIDE').length;
  const suspendedCount = items.filter((item) => item.statut_verification === 'SUSPENDU').length;

  return (
    <>
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-500">Total des chauffeurs</p><p className="mt-1 text-2xl font-black text-[#121C2D]">{items.length}</p></div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-500">Comptes actifs</p><p className="mt-1 text-2xl font-black text-emerald-700">{activeCount}</p></div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-500">Comptes suspendus</p><p className="mt-1 text-2xl font-black text-rose-700">{suspendedCount}</p></div>
      </div>
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold text-[#121C2D]">Liste des chauffeurs</h2><p className="text-sm text-slate-500">Consultez et gérez les comptes de votre flotte.</p></div>
          <select aria-label="Filtrer les chauffeurs par statut" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-slate-600">
            <option value="TOUS">Tous les statuts</option><option value="VALIDE">Actifs</option><option value="SUSPENDU">Suspendus</option>
          </select>
        </div>
        {visibleItems.length ? <div className="divide-y divide-gray-100">
          {visibleItems.map((item) => {
          const status = item.statut_verification || 'VALIDE';
          const phone = String(item.telephone_whatsapp || '').replace(/\D/g, '');
          const internationalPhone = phone.length === 9 ? `221${phone}` : phone.startsWith('00') ? phone.slice(2) : phone;
          const whatsappUrl = internationalPhone
            ? `https://wa.me/${internationalPhone}?text=${encodeURIComponent(`Bonjour ${item.nom}, je vous contacte au sujet de votre compte Translink-Africa.`)}`
            : '';
          const expanded = String(expandedDriverId) === String(item.id);
          return (
            <article key={item.id} className="p-5 transition-colors hover:bg-slate-50/70">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <button type="button" onClick={() => setExpandedDriverId(expanded ? null : item.id)} className="flex min-w-0 items-center gap-4 text-left">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#123b4a] font-bold text-white">{item.nom?.charAt(0)?.toUpperCase() || '?'}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-[#121C2D]">{item.nom}</span>
                    <span className="block truncate text-sm text-slate-500">{item.email || 'E-mail non renseigné'}</span>
                    <span className="block truncate text-xs text-slate-400">{item.telephone_whatsapp || 'Téléphone non renseigné'} · {item.ville || 'Ville non renseignée'}</span>
                  </span>
                </button>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <span className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                    status === 'VALIDE' ? 'bg-emerald-50 text-emerald-700' : status === 'SUSPENDU' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
                  }`}>{status.replace('_', ' ')}</span>
                  <button type="button" onClick={() => setExpandedDriverId(expanded ? null : item.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-white">{expanded ? 'Masquer' : 'Détails'}</button>
                  <ActionsMenu label={`Autres actions pour ${item.nom}`}>
                    {whatsappUrl && <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"><MessageCircle size={15} /> WhatsApp</a>}
                    <button type="button" disabled={busy} onClick={() => {
                      setError('');
                      setPendingStatus({ id: item.id, status: status === 'SUSPENDU' ? 'VALIDE' : 'SUSPENDU', name: item.nom });
                    }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{status === 'SUSPENDU' ? 'Lever la suspension' : 'Suspendre'}</button>
                    <button type="button" disabled={busy} onClick={() => {
                      setError('');
                      setPendingDelete(item);
                    }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 size={15} /> Supprimer</button>
                  </ActionsMenu>
                </div>
              </div>
              {expanded && <dl className="mt-4 grid gap-x-4 gap-y-3 rounded-lg bg-slate-50 p-4 text-sm sm:ml-[3.75rem] sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">Identifiant du compte</dt><dd className="mt-0.5 font-semibold text-slate-800">#{item.id}</dd></div>
                <div><dt className="text-xs text-slate-500">Statut du compte</dt><dd className="mt-0.5 font-semibold text-slate-800">{status.replace('_', ' ')}</dd></div>
                <div><dt className="text-xs text-slate-500">Téléphone WhatsApp</dt><dd className="mt-0.5 break-all font-semibold text-slate-800">{item.telephone_whatsapp || 'Non renseigné'}</dd></div>
                <div><dt className="text-xs text-slate-500">Adresse e-mail</dt><dd className="mt-0.5 break-all font-semibold text-slate-800">{item.email || 'Non renseignée'}</dd></div>
                <div><dt className="text-xs text-slate-500">Ville</dt><dd className="mt-0.5 font-semibold text-slate-800">{item.ville || 'Non renseignée'}</dd></div>
                <div><dt className="text-xs text-slate-500">Compte créé le</dt><dd className="mt-0.5 font-semibold text-slate-800">{item.date_creation ? new Date(item.date_creation).toLocaleDateString('fr-FR') : '—'}</dd></div>
              </dl>}
            </article>
          );
          })}
        </div> : <p className="p-12 text-center text-sm text-slate-500">{items.length ? 'Aucun chauffeur dans cette catégorie.' : 'Aucun chauffeur dans votre flotte pour le moment.'}</p>}
      </section>
      <ConfirmDialog
        open={Boolean(pendingStatus)}
        title={pendingStatus?.status === 'SUSPENDU' ? 'Suspendre ce compte chauffeur ?' : 'Lever la suspension ?'}
        message={pendingStatus?.status === 'SUSPENDU'
          ? `Le chauffeur ${pendingStatus?.name} ne pourra plus accéder à son compte jusqu’à la levée de la suspension.`
          : `Le compte de ${pendingStatus?.name} retrouvera son accès à la plateforme.`}
        confirmLabel={pendingStatus?.status === 'SUSPENDU' ? 'Suspendre le compte' : 'Réactiver le compte'}
        busy={busy}
        errorMessage={error}
        onCancel={() => { if (!busy) { setPendingStatus(null); setError(''); } }}
        onConfirm={updateStatus}
      />
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Supprimer ce compte chauffeur ?"
        message={pendingDelete ? `Le compte de ${pendingDelete.nom} sera définitivement supprimé. L’historique des courses restera conservé, mais ne sera plus lié à son compte.` : ''}
        confirmLabel="Supprimer le compte"
        busy={busy}
        errorMessage={error}
        onCancel={() => { if (!busy) { setPendingDelete(null); setError(''); } }}
        onConfirm={deleteDriver}
      />
    </>
  );
}

function ActionsMenu({ label, children }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeMenu = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return <div ref={menuRef} className={open ? 'basis-full min-w-full' : 'relative'}>
    <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} title={label} onClick={() => setOpen((current) => !current)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-[#121C2D] hover:text-[#121C2D]"><MoreHorizontal size={17} /></button>
    {open && <div role="menu" onClick={() => setOpen(false)} className="mt-2 grid w-full gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2">{children}</div>}
  </div>;
}

function EmptyState({ icon: Icon, text }) {
  return <div className="col-span-full rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center"><Icon size={32} className="mx-auto text-slate-300" /><p className="mt-3 text-sm text-slate-500">{text}</p></div>;
}

function StatusButton({ camion, onStatusChange }) {
  const [status, setStatus] = useState(camion.statut || 'INDISPONIBLE');
  const updateStatus = async (event) => {
    const nextStatus = event.target.value;
    setStatus(nextStatus);
    try {
      await api.put(`/api/camions/${camion.id}/status`, { statut: nextStatus });
      if (onStatusChange) {
        onStatusChange();
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut', error);
      // Revert on error
      setStatus(camion.statut || 'INDISPONIBLE');
    }
  };

  return <select value={status} onChange={updateStatus} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#121C2D] outline-none focus:border-[#FF6A3D]"><option value="DISPONIBLE">Disponible</option><option value="EN_MISSION">En mission</option><option value="INDISPONIBLE">Indisponible</option></select>;
}
