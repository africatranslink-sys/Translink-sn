import { useEffect, useState } from 'react';
import { Check, LayoutDashboard, MapPin, Search, Settings, Truck } from 'lucide-react';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const initialForm = { camion_id: '', position_actuelle: '', destinations_possibles: '', disponibilite_date: '' };

export default function PublishAvailabilityPage() {
  const { user } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [camions, setCamions] = useState([]);
  const [loadingCamions, setLoadingCamions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const sidebarItems = [{ label: 'Tableau de bord', icon: LayoutDashboard, href: '/transporteur' }, { label: 'Mes camions', icon: Truck, href: '/transporteur/camions' }, { label: 'Offres disponibles', icon: Search, href: '/transporteur/recherche' }, { label: 'Suivi en temps réel', icon: MapPin, href: '/transporteur/suivi' }, { label: 'Paramètres', icon: Settings, href: '/profile' }];
  useEffect(() => {
    api.get('/api/camions/me').then((response) => setCamions(Array.isArray(response.data) ? response.data : [])).catch(() => setCamions([])).finally(() => setLoadingCamions(false));
  }, []);
  const change = (event) => setForm({ ...form, [event.target.name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/api/annonces/disponibilites', form);
      setForm(initialForm);
      setMessage('Disponibilité publiée. Les offres correspondant à votre itinéraire apparaîtront bientôt.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'La disponibilité n’a pas pu être publiée.');
    } finally {
      setSaving(false);
    }
  };
  return <DashboardLayout sidebarItems={sidebarItems} user={user}><div className="space-y-6"><header className="rounded-2xl bg-[#123b4a] p-7 text-white"><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-200">Retour à vide</p><h1 className="mt-2 text-3xl font-bold">Publier une disponibilité</h1><p className="mt-2 max-w-2xl text-slate-300">Indiquez la position de votre camion et son prochain corridor pour recevoir des opportunités pertinentes.</p></header>{message && <div className="rounded-lg border border-teal-100 bg-teal-50 p-4 text-sm text-teal-800">{message}</div>}<form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]"><section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><div className="grid gap-5 md:grid-cols-2"><Field label="Véhicule" name="camion_id" value={form.camion_id} onChange={change} placeholder="DK-8899-A" /><Field label="Position actuelle" name="position_actuelle" value={form.position_actuelle} onChange={change} /><Field label="Destination souhaitée" name="destinations_possibles" value={form.destinations_possibles} onChange={change} /><Field label="Date de disponibilité" type="date" name="disponibilite_date" value={form.disponibilite_date} onChange={change} /><Field label="Capacité disponible (tonnes)" name="capacite_tonnes" value={form.capacite_tonnes} onChange={change} /></div><button type="submit" className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#0f766e] py-3.5 font-bold text-white hover:bg-[#0b625c]"><Check size={18} /> Publier la disponibilité</button></section><aside className="rounded-xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-center gap-3"><MapPin className="text-[#0f766e]" /><div><h2 className="font-bold text-[#123b4a]">Votre corridor</h2><p className="text-sm text-slate-500">Position suivie par GPS</p></div></div><div className="mt-6 rounded-xl bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">Itinéraire</p><p className="mt-2 font-bold text-[#123b4a]">{form.position_actuelle || 'Position'} → {form.destinations_possibles || 'Destination'}</p><p className="mt-3 text-xs leading-5 text-slate-500">Les chargeurs pourront voir votre disponibilité et vous contacter via WhatsApp.</p></div></aside></form></div></DashboardLayout>;
}

function Field({ label, name, value, onChange, type = 'text', placeholder }) { return <label className="block"><span className="mb-1.5 block text-sm font-bold text-[#123b4a]">{label}</span><input required={name !== 'camion_id'} type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-[#0f766e] focus:ring-2 focus:ring-teal-100" /></label>; }