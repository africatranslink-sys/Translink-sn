import React, { useState } from 'react';
import { ArrowLeft, Check, LayoutDashboard, Search, Settings, Truck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';



const initialForm = {
  type_vehicule: '',
  capacite_tonnes: '',
  plaque_immatriculation: '',
};

const initialDocuments = { carteGriseRecto: null, carteGriseVerso: null, assurance: null, photos: [] };

export default function TransporteurCamionForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const trucksPath = user?.role === 'CHAUFFEUR' ? '/chauffeur/camions' : '/transporteur/camions';
  const [form, setForm] = useState(initialForm);
  const [documents, setDocuments] = useState(initialDocuments);
  const [createdCamionId, setCreatedCamionId] = useState(null);
  const [uploadedDocumentKeys, setUploadedDocumentKeys] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const changeDocument = (name, event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (name === 'photos' && selectedFiles.length > 4) {
      setError('Vous pouvez sélectionner au maximum 4 photos du véhicule.');
      event.target.value = '';
      return;
    }
    setDocuments((current) => ({ ...current, [name]: name === 'photos' ? selectedFiles : selectedFiles[0] || null }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      if (!documents.carteGriseRecto || !documents.carteGriseVerso || !documents.assurance || documents.photos.length === 0) {
        throw new Error('La carte grise recto/verso, l’assurance et au moins une photo du véhicule sont obligatoires.');
      }

      let camionId = createdCamionId;
      if (!camionId) {
        const response = await api.post('/api/camions', {
          ...form,
          plaque_immatriculation: form.plaque_immatriculation.trim().toUpperCase(),
          capacite_tonnes: Number(form.capacite_tonnes),
        });
        camionId = response.data?.camion?.id;
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

      setMessage('Camion et documents enregistrés avec succès.');
      setForm(initialForm);
      setDocuments(initialDocuments);
      setCreatedCamionId(null);
      setUploadedDocumentKeys([]);
      window.setTimeout(() => navigate(trucksPath), 700);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible d’enregistrer ce camion.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout user={user}>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link to={trucksPath} className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#FF6A3D]"><ArrowLeft size={16} /> Retour à mes camions</Link>
        <header className="rounded-2xl bg-[#121C2D] p-7 text-white shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">Gestion de flotte</p>
          <h1 className="mt-2 text-3xl font-bold">Ajouter un camion</h1>
          <p className="mt-2 max-w-2xl text-slate-300">Enregistrez les informations administratives du véhicule avant de publier ses disponibilités.</p>
        </header>

        {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}
        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

        <form onSubmit={submit} className="space-y-7 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <section>
            <h2 className="mb-5 text-lg font-bold text-[#121C2D]">Informations du véhicule</h2>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Type de véhicule" name="type_vehicule" value={form.type_vehicule} onChange={change} placeholder="Plateau, citerne, fourgon..." />
              <Field label="Capacité (tonnes)" name="capacite_tonnes" value={form.capacite_tonnes} onChange={change} type="number" min="0.1" step="0.1" placeholder="40" />
              <Field label="Plaque d’immatriculation" name="plaque_immatriculation" value={form.plaque_immatriculation} onChange={change} placeholder="DK-8899-A" />
            </div>
          </section>
          <section className="border-t border-slate-100 pt-6">
            <h2 className="text-lg font-bold text-[#121C2D]">Documents de ce camion</h2>
            <p className="mb-5 mt-1 text-sm text-slate-500">Formats acceptés : PDF, JPG, PNG ou WEBP. Maximum 5 Mo par fichier.</p>
            <div className="grid gap-5 md:grid-cols-2">
              <FileField label="Carte grise - recto" name="carteGriseRecto" value={documents.carteGriseRecto} onChange={changeDocument} required />
              <FileField label="Carte grise - verso" name="carteGriseVerso" value={documents.carteGriseVerso} onChange={changeDocument} required />
              <FileField label="Assurance du véhicule" name="assurance" value={documents.assurance} onChange={changeDocument} required />
              <FileField label="Photos du camion (1 à 4)" name="photos" value={documents.photos} onChange={changeDocument} multiple required />
            </div>
          </section>
          <button disabled={saving} type="submit" className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#FF6A3D] py-3.5 font-bold text-white hover:bg-[#e85b2d] disabled:cursor-not-allowed disabled:opacity-60">
            <Check size={18} /> {saving ? 'Enregistrement...' : createdCamionId ? 'Terminer l’enregistrement' : 'Enregistrer le camion'}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, name, value, onChange, type = 'text', min, step, placeholder }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-bold text-[#121C2D]">{label}</span><input required type={type} min={min} step={step} name={name} value={value} onChange={onChange} placeholder={placeholder} className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none transition focus:border-[#FF6A3D] focus:ring-2 focus:ring-orange-100" /></label>;
}

function FileField({ label, name, value, onChange, required = false, multiple = false }) {
  const selectedFiles = Array.isArray(value) ? value : value ? [value] : [];
  return <label className="block rounded-lg border border-dashed border-slate-300 p-3 transition hover:border-[#FF6A3D]"><span className="mb-2 block text-sm font-bold text-[#121C2D]">{label}{required && <span className="text-[#FF6A3D]"> *</span>}</span><input required={required} multiple={multiple} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(event) => onChange(name, event)} className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#FF6A3D]" />{selectedFiles.length > 0 && <span className="mt-2 block truncate text-xs text-emerald-600">{selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} photo(s) sélectionnée(s)`}</span>}</label>;
}
