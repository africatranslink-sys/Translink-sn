import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, CalendarDays, Check, LayoutDashboard, FileText, Search, History, MapPin, Package, Send, Settings, Truck } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import DemandLocationMap from '../components/DemandLocationMap';
import api from '../utils/api';
import { getMapboxToken } from '../utils/mapboxToken';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/useLanguage';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';

const sidebarItems = [
  { label: 'Tableau de bord', icon: LayoutDashboard, href: '/chargeur' },
  { label: 'Mes demandes', icon: FileText, href: '/chargeur/demandes' },
  { label: 'Trouver un camion', icon: Search, href: '/chargeur/recherche' },
  { label: 'Historique', icon: History, href: '/chargeur/historique' },
  { label: 'Documents', icon: FileText, href: '/chargeur/documents' },
  { label: 'Paramètres', icon: Settings, href: '/profile' },
];

const initialForm = {
  nature_marchandise: 'Ciment',
  tonnage: '',
  ville_depart: '',
  ville_arrivee: '',
  type_camion_requis: 'Plateau',
  date_chargement: '',
  heure_chargement: '08:00',
  prix_propose: '',
  exigences_particulieres: '',
  quartier_chargement: '',
  position_lng: '',
  position_lat: '',
};

export default function CreateDemandePage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const renewalId = searchParams.get('renouveler');
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [loadingRenewal, setLoadingRenewal] = useState(Boolean(renewalId));
  const [canPublishRequests, setCanPublishRequests] = useState(undefined);
  const [error, setError] = useAutoDismissMessage('');
  const [success, setSuccess] = useAutoDismissMessage('');
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/api/paiements/abonnements/mien')
      .then(({ data }) => {
        if (active) setCanPublishRequests(data?.subscriptionActive === true
          && data?.subscription?.plan === 'CHARGEUR'
          && data?.entitlements?.canPublish === true);
      })
      .catch((requestError) => {
        if (active) {
          setCanPublishRequests(false);
          setError(requestError.response?.data?.error || 'Impossible de vérifier votre abonnement chargeur.');
        }
      });
    return () => { active = false; };
  }, [setError]);

  useEffect(() => {
    if (!renewalId) return undefined;
    let active = true;
    setLoadingRenewal(true);
    api.get('/api/annonces/demandes/miennes').then(({ data }) => {
      const demande = data.find((item) => String(item.id) === renewalId);
      if (!active) return;
      if (!demande) {
        setError('Cette annonce ne peut plus être renouvelée.');
        return;
      }
      setForm({
        nature_marchandise: demande.nature_marchandise || '',
        tonnage: String(demande.tonnage ?? ''),
        ville_depart: demande.ville_depart || '',
        ville_arrivee: demande.ville_arrivee || '',
        type_camion_requis: demande.type_camion_requis || 'Plateau',
        date_chargement: String(demande.date_chargement || '').slice(0, 10),
        heure_chargement: String(demande.heure_chargement || '08:00').slice(0, 5),
        prix_propose: demande.prix_propose == null ? '' : String(demande.prix_propose),
        exigences_particulieres: demande.exigences_particulieres || '',
        quartier_chargement: demande.quartier_chargement || '',
        position_lng: demande.position_lng == null ? '' : String(demande.position_lng),
        position_lat: demande.position_lat == null ? '' : String(demande.position_lat),
      });
      setLocationMessage('Modifiez la date et l’heure pour les choisir dans le futur, puis republiez l’annonce.');
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.error || 'Impossible de charger l’annonce à renouveler.');
    }).finally(() => {
      if (active) setLoadingRenewal(false);
    });
    return () => { active = false; };
  }, [renewalId, setError]);

  const handleChange = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const handleGoodsChange = (event) => {
    if (language === 'en' && form.nature_marchandise === 'Ciment' && event.target.value === 'Cement') return;
    handleChange(event);
  };

  const updateCoordinates = async ([longitude, latitude]) => {
    const roundedLongitude = Number(longitude.toFixed(6));
    const roundedLatitude = Number(latitude.toFixed(6));
    setForm((current) => ({ ...current, position_lng: String(roundedLongitude), position_lat: String(roundedLatitude) }));
    setLocationMessage('');

    const token = await getMapboxToken();
    if (!token) {
      setLocationMessage('Saisissez le nom du quartier manuellement.');
      return;
    }

    try {
      const params = new URLSearchParams({ access_token: token, language: 'fr', types: 'neighborhood,locality,place,district', limit: '5' });
      const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${roundedLongitude},${roundedLatitude}.json?${params}`);
      if (!response.ok) throw new Error('Géocodage indisponible.');
      const result = await response.json();
      const feature = result.features?.find((place) => place.place_type?.some((type) => ['neighborhood', 'district'].includes(type)));
      if (feature?.text) {
        setForm((current) => ({ ...current, quartier_chargement: feature.text }));
        setLocationMessage('Quartier détecté par la carte. Vous pouvez le corriger si nécessaire.');
      } else {
        setLocationMessage('Quartier introuvable sur la carte : saisissez son nom ci-dessous pour aider le chauffeur à vous repérer.');
      }
    } catch {
      setLocationMessage('Quartier non détecté : saisissez son nom ci-dessous pour aider le chauffeur à vous repérer.');
    }
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      setLocationMessage('La géolocalisation n’est pas disponible. Saisissez les coordonnées ou choisissez un point sur la carte.');
      return;
    }

    if (!window.isSecureContext && !window.location.hostname.includes('localhost')) {
      setLocationMessage('La localisation sur mobile exige un accès sécurisé. Ouvre l’application via HTTPS/localhost, ou saisissez manuellement les coordonnées.');
      return;
    }

    setLocating(true);
    setLocationMessage('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        updateCoordinates([position.coords.longitude, position.coords.latitude]);
        setLocating(false);
      },
      () => {
        setLocationMessage('Position inaccessible. Vérifiez les permissions de localisation de votre téléphone ou saisissez les coordonnées manuellement.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canPublishRequests) {
      setError('Un abonnement chargeur actif est requis avant de publier une demande.');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const payload = { ...form, tonnage: Number(form.tonnage), prix_propose: form.prix_propose ? Number(form.prix_propose) : null };
      if (renewalId) {
        await api.post(`/api/annonces/demandes/miennes/${renewalId}/renouveler`, payload);
        setSuccess('Votre annonce a été renouvelée et republiée.');
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.delete('renouveler');
          return next;
        });
      } else {
        await api.post('/api/annonces/demandes', payload);
        setSuccess('Votre demande a été publiée. Les transporteurs peuvent maintenant la consulter.');
      }
      setForm(initialForm);
      setLocationMessage('');
    } catch (err) {
      setError(err.response?.data?.error || 'La publication de la demande a échoué.');
    } finally {
      setLoading(false);
    }
  };

  const previewDate = form.date_chargement
    ? new Date(`${form.date_chargement}T00:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'À définir';
  const previewBudget = form.prix_propose ? `${Number(form.prix_propose).toLocaleString('fr-FR')} FCFA` : 'Budget à discuter';
  const minLoadingDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

  return <DashboardLayout sidebarItems={sidebarItems} user={user}>
    <div className="mx-auto max-w-6xl space-y-5">
      <Link to="/chargeur" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-[#0C1B32]"><ArrowLeft size={16} />Retour au tableau de bord</Link>
      <header className="rounded-xl bg-[#0C1B32] px-5 py-5 text-white sm:px-6">
        <h1 className="text-xl font-bold">{renewalId ? 'Renouveler une annonce de transport' : 'Publier une demande de transport'}</h1>
        <p className="mt-1 text-sm text-slate-200">{renewalId ? 'Choisissez une nouvelle date de chargement pour republier votre annonce.' : 'Remplissez les détails ci-dessous pour recevoir des offres de transporteurs qualifiés.'}</p>
      </header>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}
      {success && <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700"><Check size={17} />{success}<button type="button" onClick={() => navigate('/chargeur/demandes')} className="ml-auto font-bold underline">Voir mes demandes</button></div>}
      {canPublishRequests === undefined ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Vérification de l’abonnement chargeur…</p>
        : canPublishRequests ? <form onSubmit={handleSubmit} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.95fr)]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="mb-5 border-l-4 border-[#FF6A3D] pl-3 text-base font-bold text-[#0C1B32]">Détails du chargement &amp; trajet</h2>
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <Field label="Type de marchandise" name="nature_marchandise" value={language === 'en' && form.nature_marchandise === 'Ciment' ? 'Cement' : form.nature_marchandise} onChange={handleGoodsChange} required />
            <Field label="Poids estimé (en tonnes)" name="tonnage" type="number" min="0.1" step="0.1" value={form.tonnage} onChange={handleChange} placeholder="Ex. 40" required />
            <Field label="Lieu de chargement (ville)" name="ville_depart" value={form.ville_depart} onChange={handleChange} placeholder="Dakar" required />
            <Field label="Destination" name="ville_arrivee" value={form.ville_arrivee} onChange={handleChange} placeholder="Bamako" required />
            <Field label="Quartier / point de chargement" name="quartier_chargement" value={form.quartier_chargement} onChange={handleChange} placeholder="Ex. Plateau" required />
            <SelectField label="Type de camion requis" name="type_camion_requis" value={form.type_camion_requis} onChange={handleChange} options={['Plateau', 'Benne', 'Citerne', 'Fourgon', 'Frigo']} />
            <Field label="Date souhaitée de chargement" name="date_chargement" type="date" min={renewalId ? minLoadingDate : undefined} value={form.date_chargement} onChange={handleChange} required />
            <Field label="Heure de chargement" name="heure_chargement" type="time" value={form.heure_chargement} onChange={handleChange} required />
            <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-semibold text-[#0C1B32]">Exigences particulières (équipement, bâche, etc.)</span><textarea name="exigences_particulieres" value={form.exigences_particulieres} onChange={handleChange} rows={3} placeholder="Précisez les consignes utiles au transporteur…" className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#FF6A3D] focus:ring-1 focus:ring-[#FF6A3D]" /></label>
            <Field label="Budget estimé (FCFA), optionnel" name="prix_propose" type="number" min="0" value={form.prix_propose} onChange={handleChange} placeholder="Ex. 750000" />
          </div>
          {locationMessage && <p role="status" className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800"><MapPin size={16} className="mt-0.5 shrink-0" />{locationMessage}</p>}
          <button type="submit" disabled={loading || loadingRenewal} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#FF6A3D] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#e85b2d] disabled:opacity-60"><Send size={16} />{loading ? 'Publication…' : loadingRenewal ? 'Chargement de l’annonce…' : renewalId ? 'Renouveler et republier' : 'Publier la demande de transport'}</button>
        </section>
        <aside className="space-y-4 rounded-xl border border-[#0C1B32] bg-[#e8f0ff] p-4 sm:p-5">
          <h2 className="text-center text-sm font-bold text-[#0C1B32]">Aperçu en direct pour les transporteurs</h2>
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3"><span className="rounded-md bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-900">Aperçu de l’annonce</span><span className="text-[10px] text-slate-500">Nouvelle demande</span></div>
            <h3 className="mt-3 flex items-center gap-1.5 text-sm font-bold text-[#0C1B32]"><span>{form.ville_depart || 'Ville de départ'}</span><ArrowLeftRight size={14} className="text-[#FF6A3D]" /><span>{form.ville_arrivee || 'Destination'}</span></h3>
            <p className="mt-1 text-xs font-semibold text-[#e85b2d]">Budget proposé : {previewBudget}</p>
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-700">
              <p className="flex items-start gap-2"><Package size={14} className="mt-0.5 shrink-0" />Marchandise : <strong>{form.nature_marchandise || 'À préciser'}{form.tonnage ? ` (${form.tonnage} t)` : ''}</strong></p>
              <p className="flex items-start gap-2"><CalendarDays size={14} className="mt-0.5 shrink-0" />Chargement : <strong>{previewDate} à {form.heure_chargement || 'À définir'}</strong></p>
              <p className="flex items-start gap-2"><Truck size={14} className="mt-0.5 shrink-0" />Camion : <strong>{form.type_camion_requis || 'À préciser'}</strong></p>
              {form.quartier_chargement && <p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0" />Point de chargement : <strong>{form.quartier_chargement}</strong></p>}
              {form.exigences_particulieres && <p className="border-t border-slate-100 pt-2 text-slate-600">{form.exigences_particulieres}</p>}
            </div>
          </section>
          <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-bold text-[#0C1B32]">Point de chargement sur la carte</h3><button type="button" onClick={locateMe} disabled={locating} className="text-[10px] font-semibold text-[#0C1B32] underline decoration-slate-400 underline-offset-2 hover:decoration-[#0C1B32] disabled:opacity-60">{locating ? 'Localisation…' : 'Utiliser ma position'}</button></div>
          <DemandLocationMap coordinates={form.position_lng && form.position_lat ? [Number(form.position_lng), Number(form.position_lat)] : null} onSelect={updateCoordinates} neighborhood={form.quartier_chargement} height={220} />
          <div className="grid grid-cols-2 gap-3"><Field label="Longitude" name="position_lng" type="number" step="any" value={form.position_lng} onChange={handleChange} placeholder="-17.4677" required /><Field label="Latitude" name="position_lat" type="number" step="any" value={form.position_lat} onChange={handleChange} placeholder="14.7167" required /></div>
          <p className="text-[10px] leading-4 text-slate-600">Cliquez sur la carte pour placer le point exact. Les transporteurs proches de l’itinéraire seront notifiés après publication.</p>
        </aside>
      </form>
        : <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h2 className="text-lg font-bold">Abonnement chargeur requis</h2>
          <p className="mt-2 text-sm leading-6">Pour publier ou renouveler une demande, activez votre abonnement de 2 500 FCFA par mois. Le renouvellement se fait manuellement, sans prélèvement automatique.</p>
          <Link to="/abonnement" className="mt-4 inline-flex rounded-lg bg-[#FF6A3D] px-5 py-3 text-sm font-bold text-white">Activer mon abonnement</Link>
        </section>}
    </div>
  </DashboardLayout>;
}

function Field({ label, name, type = 'text', value, onChange, placeholder, required, min, step }) {
  return <div><label className="mb-1.5 block text-xs font-semibold text-[#0C1B32]" htmlFor={name}>{label}</label><input id={name} name={name} type={type} value={value} onChange={onChange} placeholder={placeholder} required={required} min={min} step={step} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-[#FF6A3D] focus:ring-1 focus:ring-[#FF6A3D]" /></div>;
}

function SelectField({ label, name, value, onChange, options }) {
  return <div><label className="mb-1.5 block text-xs font-semibold text-[#0C1B32]" htmlFor={name}>{label}</label><select id={name} name={name} value={value} onChange={onChange} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#FF6A3D] focus:ring-1 focus:ring-[#FF6A3D]">{options.map((option) => <option key={option}>{option}</option>)}</select></div>;
}
