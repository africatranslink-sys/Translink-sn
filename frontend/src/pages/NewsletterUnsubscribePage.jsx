import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, MailX } from 'lucide-react';
import api from '../utils/api';

export default function NewsletterUnsubscribePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState('ready');
  const [message, setMessage] = useState('');

  const unsubscribe = async () => {
    setStatus('loading');
    setMessage('');
    try {
      const response = await api.post('/api/auth/newsletter/unsubscribe', { token });
      setMessage(response.data.message);
      setStatus('done');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de traiter votre demande. Veuillez réessayer.');
      setStatus('error');
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10">
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${status === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-[#FF6A3D]'}`}>
          {status === 'done' ? <Check size={26} /> : <MailX size={26} />}
        </div>
        <h1 className="mt-5 text-2xl font-bold text-[#121C2D]">{status === 'done' ? 'Désabonnement confirmé' : 'Se désabonner de la newsletter'}</h1>
        <p className={`mt-3 text-sm leading-6 ${status === 'error' ? 'text-rose-700' : 'text-slate-600'}`}>{message || (token ? 'Confirmez votre choix pour ne plus recevoir les e-mails d’actualités et de promotions.' : 'Le lien de désabonnement est incomplet.')}</p>
        {status !== 'done' && token && <button type="button" onClick={unsubscribe} disabled={status === 'loading'} className="mt-6 rounded-lg bg-[#121C2D] px-5 py-3 font-bold text-white transition hover:bg-slate-700 disabled:opacity-60">{status === 'loading' ? 'Traitement...' : status === 'error' ? 'Réessayer' : 'Confirmer le désabonnement'}</button>}
        <p className="mt-7 text-xs text-slate-400">Translink-Africa</p>
      </section>
    </main>
  );
}
