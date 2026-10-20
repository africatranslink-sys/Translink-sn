import { useEffect, useMemo, useState } from 'react';
import { Mail, RefreshCw, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from '../layouts/DashboardLayout';
import api from '../utils/api';
import { ADMIN_SIDEBAR_ITEMS } from '../utils/adminNavigation';

const SUBJECT_LIMIT = 150;
const MESSAGE_LIMIT = 5000;
const replacePreviewName = (value) => value.replace(/\{\{\s*nom\s*\}\}/gi, 'Aminata Diallo').replace(/\{\{\s*email\s*\}\}/gi, 'aminata@example.com');
const statusLabels = {
  EN_COURS: 'Envoi en cours',
  TERMINE: 'Terminé',
  PARTIEL: 'Terminé avec des erreurs',
  ECHEC: 'Échec'
};
const fetchNewsletterData = () => Promise.all([
  api.get('/api/admin/newsletter/audience'),
  api.get('/api/admin/newsletter/campaigns')
]);

export default function AdminNewsletterPage() {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [eligibleCount, setEligibleCount] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campaign, setCampaign] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const previewSubject = subject || 'Objet de votre message';
  const previewMessage = useMemo(() => replacePreviewName(message || 'Votre message apparaîtra ici.'), [message]);

  const loadNewsletterData = async () => {
    setLoading(true);
    setError('');
    try {
      const [audienceResponse, campaignsResponse] = await fetchNewsletterData();
      setEligibleCount(audienceResponse.data.eligible_count);
      setCampaigns(campaignsResponse.data);
      setCampaign((current) => current || campaignsResponse.data.find((item) => item.status === 'EN_COURS') || null);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de charger les données du publipostage.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchNewsletterData()
      .then(([audienceResponse, campaignsResponse]) => {
        if (!active) return;
        setEligibleCount(audienceResponse.data.eligible_count);
        setCampaigns(campaignsResponse.data);
        setCampaign(campaignsResponse.data.find((item) => item.status === 'EN_COURS') || null);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error || 'Impossible de charger les données du publipostage.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const campaignId = campaign?.id;
  const campaignStatus = campaign?.status;

  useEffect(() => {
    if (!campaignId || campaignStatus !== 'EN_COURS') return undefined;
    const interval = window.setInterval(async () => {
      try {
        const response = await api.get(`/api/admin/newsletter/campaigns/${campaignId}`);
        setCampaign(response.data);
        if (response.data.status !== 'EN_COURS') {
          setCampaigns((current) => [response.data, ...current.filter((item) => item.id !== response.data.id)].slice(0, 10));
          const audienceResponse = await api.get('/api/admin/newsletter/audience');
          setEligibleCount(audienceResponse.data.eligible_count);
        }
      } catch (requestError) {
        setError(requestError.response?.data?.error || 'Impossible d’actualiser le statut de la campagne.');
      }
    }, 2500);
    return () => window.clearInterval(interval);
  }, [campaignId, campaignStatus]);

  const handleSend = async (event) => {
    event.preventDefault();
    setError('');
    setSending(true);
    try {
      const response = await api.post('/api/admin/newsletter/campaigns', {
        subject,
        message,
        confirmed: true,
        confirmed_recipient_count: eligibleCount
      });
      setCampaign(response.data);
      setCampaigns((current) => [response.data, ...current.filter((item) => item.id !== response.data.id)].slice(0, 10));
      setConfirmed(false);
      setSubject('');
      setMessage('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'La campagne n’a pas pu être démarrée.');
      if (requestError.response?.status === 409) void loadNewsletterData();
    } finally {
      setSending(false);
    }
  };

  const updateContent = (setter) => (event) => {
    setter(event.target.value);
    setConfirmed(false);
  };

  const activeCampaign = campaignStatus === 'EN_COURS';

  return (
    <DashboardLayout sidebarItems={ADMIN_SIDEBAR_ITEMS} user={user}>
      <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-[#FF6A3D]">Communication</p>
            <h1 className="mt-1 text-3xl font-bold text-[#121C2D]">Newsletter et publipostage</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Rédigez une annonce ou une promotion, vérifiez son rendu, puis envoyez-la uniquement aux utilisateurs ayant accepté de recevoir ces e-mails.</p>
          </div>
          <button type="button" onClick={() => void loadNewsletterData()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualiser
          </button>
        </header>

        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
          <form onSubmit={handleSend} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div><h2 className="text-lg font-bold text-[#121C2D]">Composer un e-mail</h2><p className="mt-1 text-sm text-slate-500">Les limites sont appliquées côté interface et serveur.</p></div>
              <div className="rounded-xl bg-orange-50 p-3 text-[#FF6A3D]"><Mail size={22} /></div>
            </div>

            <div className="rounded-lg border border-teal-100 bg-teal-50 p-4">
              <p className="text-sm font-semibold text-teal-900">Audience consentante</p>
              <p className="mt-1 text-2xl font-bold text-teal-900">{loading || eligibleCount === null ? '…' : eligibleCount.toLocaleString('fr-FR')}</p>
              <p className="mt-1 text-xs leading-5 text-teal-800">Les personnes désabonnées ou n’ayant pas donné leur accord ne recevront pas le message.</p>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-800">Objet</span>
              <input value={subject} onChange={updateContent(setSubject)} maxLength={SUBJECT_LIMIT} required placeholder="Ex. Bonne fête de Tabaski !" className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-[#FF6A3D] focus:ring-2 focus:ring-orange-100" />
              <span className="mt-1 block text-right text-xs text-slate-400">{subject.length}/{SUBJECT_LIMIT}</span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-800">Message</span>
              <textarea value={message} onChange={updateContent(setMessage)} maxLength={MESSAGE_LIMIT} required rows={10} placeholder={'Bonjour {{nom}},\n\nÉcrivez ici votre annonce ou votre promotion…'} className="w-full resize-y rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-[#FF6A3D] focus:ring-2 focus:ring-orange-100" />
              <span className="mt-1 block text-right text-xs text-slate-400">{message.length}/{MESSAGE_LIMIT}</span>
              <span className="mt-1 block text-xs text-slate-500">Personnalisation disponible dans le message : <code>{'{{nom}}'}</code> et <code>{'{{email}}'}</code>.</span>
            </label>

            <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#FF6A3D]" />
              <span>Je confirme l’envoi de cet e-mail aux <strong>{eligibleCount ?? '…'}</strong> adresses consentantes affichées ci-dessus. Chaque destinataire recevra un e-mail individuel.</span>
            </label>
            <button type="submit" disabled={sending || activeCampaign || !confirmed || eligibleCount === 0 || eligibleCount === null} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#FF6A3D] px-5 py-3 font-bold text-white transition hover:bg-[#e85b2d] disabled:cursor-not-allowed disabled:opacity-50">
              <Send size={17} /> {sending ? 'Démarrage…' : activeCampaign ? 'Une campagne est en cours' : 'Confirmer et envoyer'}
            </button>
          </form>

          <section className="space-y-5">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-[#121C2D]">Aperçu du modèle e-mail</h2><p className="mt-1 text-xs text-slate-500">Rendu final avec personnalisation et lien de désabonnement automatique.</p></div>
              <div className="bg-slate-100 p-4 sm:p-6">
                <div className="mx-auto max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="bg-[#121C2D] px-6 py-5 text-white"><p className="text-[10px] font-bold tracking-[0.16em] text-orange-300">TRANSLINK-AFRICA LOGISTIQUE</p><p className="mt-2 text-xl font-bold">TRANSLINK-AFRICA</p></div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-[#121C2D]">{previewSubject}</h3>
                    <p className="mt-4 text-sm leading-6 text-slate-600">Bonjour <strong>Aminata Diallo</strong>,<br />Une communication de Translink-Africa vous est adressée.</p>
                    <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{previewMessage}</p>
                    <p className="mt-7 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">Vous recevez ce message car vous avez accepté les communications de Translink-Africa. <span className="underline">Se désabonner</span></p>
                  </div>
                  <p className="border-t border-slate-100 px-6 py-4 text-xs leading-5 text-slate-400">Cet e-mail a été envoyé automatiquement par Translink-Africa. Merci de ne pas répondre directement à ce message.</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-[#121C2D]">État de la campagne</h2>
              {campaign ? <CampaignStatus campaign={campaign} /> : <p className="mt-3 text-sm text-slate-500">Aucune campagne lancée pendant cette session.</p>}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-[#121C2D]">Campagnes récentes</h2>
              {campaigns.length ? <ul className="mt-3 divide-y divide-slate-100">{campaigns.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="min-w-0 flex-1 truncate font-medium text-slate-700">{item.subject}</span><span className="text-xs text-slate-500">{statusLabels[item.status] || item.status} · {item.sent_count}/{item.recipient_count} envoyés</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">Aucune campagne passée.</p>}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

function CampaignStatus({ campaign }) {
  const percent = campaign.recipient_count ? Math.min(100, Math.round(campaign.processed_count * 100 / campaign.recipient_count)) : 0;
  return (
    <div className="mt-3 space-y-2 text-sm">
      <p className="font-semibold text-slate-700">{campaign.subject}</p>
      <p className={campaign.status === 'ECHEC' ? 'text-rose-700' : campaign.status === 'PARTIEL' ? 'text-amber-700' : 'text-slate-500'}>{statusLabels[campaign.status] || campaign.status}</p>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#FF6A3D] transition-all" style={{ width: `${percent}%` }} /></div>
      <p className="text-xs text-slate-500">{campaign.sent_count} envoyés · {campaign.failed_count} échecs · {campaign.skipped_count || 0} désabonnements ignorés · {campaign.recipient_count} destinataires ciblés</p>
      {campaign.error_message && <p role="alert" className="rounded bg-amber-50 p-2 text-xs text-amber-800">{campaign.error_message}</p>}
    </div>
  );
}
