import React, { useEffect, useState } from 'react';
import { Check, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import RouteMap from '../components/RouteMap';
import CitySelect from '../components/CitySelect';
import { westAfricanCities } from '../utils/westAfricanCities';
import { getSidebarItems } from '../utils/navigation';

const initialForm = { camion_id: '', position_actuelle: '', destinations_possibles: '', disponibilite_date: '', position_lng: '', position_lat: '', destination_lng: '', destination_lat: '' };

export default function TransporteurDisponibiliteForm() {
  const { user } = useAuth();
  const sidebarItems = getSidebarItems(user?.role, user);
  const [form, setForm] = useState(initialForm);
  const [camions, setCamions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/camions/me')
      .then((response) => setCamions(Array.isArray(response.data) ? response.data.filter((camion) => String(camion.proprietaire_id) === String(user?.id)) : []))
      .catch(() => setCamions([]))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const selectCity = (field, cityName) => {
    const city = westAfricanCities.find((item) => item.name === cityName);
    const prefix = field === 'position_actuelle' ? 'position' : 'destination';
    setForm((current) => ({
      ...current,
      [field]: city?.name || '',
      [`${prefix}_lng`]: city ? String(city.lng) : '',
      [`${prefix}_lat`]: city ? String(city.lat) : ''
    }));
  };

  const route = form.position_lng && form.position_lat && form.destination_lng && form.destination_lat
    ? [[Number(form.position_lng), Number(form.position_lat)], [Number(form.destination_lng), Number(form.destination_lat)]]
    : [];

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await api.post('/api/annonces/disponibilites', form);
      setForm(initialForm);
      setMessage('Disponibilité publiée avec succès.');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'La disponibilité n’a pas pu être publiée.');
    } finally {
      setSaving(false);
    }
  };

  return <DashboardLayout sidebarItems={sidebarItems} user={user}>
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/transporteur" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[#FF6A3D]">Retour au tableau de bord</Link>
      <header className="rounded-2xl bg-[#123b4a] p-7 text-white shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-200">Retour à vide</p>
        <h1 className="mt-2 text-3xl font-bold">Publier une disponibilité</h1>
        <p className="mt-2 max-w-2xl text-slate-300">Associez un camion réel à un corridor pour recevoir des demandes adaptées.</p>
      </header>

      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block md:col-span-2"><span className="mb-1.5 block text-sm font-bold text-[#123b4a]">Véhicule</span><select required name="camion_id" value={form.camion_id} onChange={change} disabled={loading} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-teal-100"><option value="">{loading ? 'Chargement des camions...' : 'Sélectionner un camion'}</option>{camions.map((camion) => <option key={camion.id} value={camion.id}>{camion.plaque_immatriculation} · {camion.type_vehicule} · {camion.capacite_tonnes} t</option>)}</select></label>
            <CityField label="Ville de départ" name="position_actuelle" value={form.position_actuelle} onChange={(event) => selectCity('position_actuelle', event.target.value)} />
            <CityField label="Ville de destination" name="destinations_possibles" value={form.destinations_possibles} onChange={(event) => selectCity('destinations_possibles', event.target.value)} />
            <Field label="Date de disponibilité" type="date" name="disponibilite_date" value={form.disponibilite_date} onChange={change} />
          </div>
          {route.length ? <div className="mt-6 overflow-hidden rounded-xl border border-slate-200"><RouteMap vehicles={[]} route={route} className="h-72" /></div> : <div className="mt-6 flex min-h-20 items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500"><MapPin className="shrink-0 text-[#FF6A3D]" size={18} />Choisissez les deux villes pour tracer le trajet sur la carte.</div>}
          <button disabled={saving || loading || !camions.length || !route.length} type="submit" className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#FF6A3D] py-3.5 font-bold text-white hover:bg-[#e85b2d] disabled:cursor-not-allowed disabled:opacity-50"><Check size={18} /> {saving ? 'Publication...' : 'Enregistrer le trajet de ce camion'}</button>
          {!loading && !camions.length && <p className="mt-3 text-center text-sm text-slate-500">Ajoutez d’abord un camion depuis la page Mes camions.</p>}
        </section>
        <aside className="rounded-xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-center gap-3"><MapPin className="text-[#0f766e]" /><div><h2 className="font-bold text-[#123b4a]">Votre corridor</h2><p className="text-sm text-slate-500">Visible par les chargeurs</p></div></div><div className="mt-6 rounded-xl bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Conseil</p><p className="mt-2 text-sm leading-6 text-slate-600">Utilisez une ville précise et une date réaliste pour améliorer les correspondances.</p></div></aside>
      </form>
    </div>
  </DashboardLayout>;
}

function Field({ label, name, value, onChange, type = 'text', placeholder }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-bold text-[#123b4a]">{label}</span><input required type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-teal-100" /></label>;
}

function CityField({ label, name, value, onChange }) {
  return <CitySelect value={value} onChange={(cityName) => onChange({ target: { name, value: cityName } })} options={westAfricanCities} placeholder="Choisir une grande ville..." className="w-full" label={label} />;
}
