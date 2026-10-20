import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, LoaderCircle, Send, X } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export default function NegotiationChatDialog({ conversation, onClose, onCourseAccepted, embedded = false }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [actingProposal, setActingProposal] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState('');
  const [socketReady, setSocketReady] = useState(Boolean(socket?.connected));
  const [conversationStatus, setConversationStatus] = useState(conversation.statut);

  const conversationId = conversation.id;
  const isOpen = conversationStatus === 'OUVERTE';
  const counterpartName = String(user?.id) === String(conversation.transporteur_id)
    ? conversation.chargeur_nom
    : conversation.transporteur_nom;

  useEffect(() => {
    let active = true;
    api.get(`/api/chats/${conversationId}/messages`)
      .then(({ data }) => {
        if (!active) return;
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setProposals(Array.isArray(data.proposals) ? data.proposals : []);
        if (data.conversation?.statut) setConversationStatus(data.conversation.statut);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.error || 'Impossible de charger l’historique de la négociation.');
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => { active = false; };
  }, [conversationId]);

  useEffect(() => {
    if (!socket) {
      return undefined;
    }
    let active = true;
    const joinConversation = () => {
      socket.emit('chat:join', { conversationId }, (response) => {
        if (!active) return;
        if (response?.error) setError(response.error);
        setSocketReady(!response?.error);
      });
    };
    const handleMessage = (item) => {
      if (String(item.conversation_id) !== String(conversationId)) return;
      setMessages((current) => current.some((entry) => entry.id === item.id) ? current : [...current, item]);
    };
    const handleProposal = (item) => {
      if (String(item.conversation_id) !== String(conversationId)) return;
      setProposals((current) => current.some((entry) => entry.id === item.id) ? current : [...current, item]);
    };
    const handleProposalUpdate = (item) => {
      if (String(item.conversationId || item.conversation_id) !== String(conversationId)) return;
      if (item.statut === 'ACCEPTEE' || item.status === 'ACCEPTEE') {
        setProposals((current) => current.map((proposal) => proposal.statut === 'EN_ATTENTE'
          ? { ...proposal, statut: proposal.id === item.proposalId || proposal.id === item.id ? 'ACCEPTEE' : 'REFUSEE' }
          : proposal));
        setConversationStatus('ACCEPTEE');
        onCourseAccepted?.();
      } else {
        setProposals((current) => current.map((proposal) => proposal.id === item.proposalId || proposal.id === item.id
          ? { ...proposal, ...item, statut: item.statut || item.status }
          : proposal));
      }
    };
    const handleConversationUpdate = (item) => {
      if (String(item.conversationId) === String(conversationId)) {
        setConversationStatus(item.statut);
        if (item.statut === 'ANNULEE') {
          setProposals((current) => current.map((proposal) => proposal.statut === 'EN_ATTENTE'
            ? { ...proposal, statut: 'REFUSEE' }
            : proposal));
        }
      }
    };
    const handleDisconnect = () => setSocketReady(false);

    socket.on('connect', joinConversation);
    socket.on('disconnect', handleDisconnect);
    socket.on('chat:new-message', handleMessage);
    socket.on('chat:new-proposal', handleProposal);
    socket.on('chat:proposal-updated', handleProposalUpdate);
    socket.on('chat:conversation-updated', handleConversationUpdate);
    if (socket.connected) joinConversation();
    return () => {
      active = false;
      socket.emit('chat:leave', { conversationId });
      socket.off('connect', joinConversation);
      socket.off('disconnect', handleDisconnect);
      socket.off('chat:new-message', handleMessage);
      socket.off('chat:new-proposal', handleProposal);
      socket.off('chat:proposal-updated', handleProposalUpdate);
      socket.off('chat:conversation-updated', handleConversationUpdate);
    };
  }, [socket, conversationId, onCourseAccepted]);

  const timeline = useMemo(() => [
    ...messages.map((item) => ({ ...item, kind: 'message', timestamp: item.date_creation })),
    ...proposals.map((item) => ({ ...item, kind: 'proposal', timestamp: item.date_creation })),
  ].sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp) || left.id - right.id), [messages, proposals]);
  const latestProposal = proposals[proposals.length - 1];

  const sendSocketEvent = (eventName, payload, update) => {
    if (!socket?.connected) {
      setError('La connexion temps réel est indisponible. Vérifiez votre connexion puis réessayez.');
      return;
    }
    setSending(true);
    setError('');
    socket.timeout(10000).emit(eventName, payload, (timeoutError, response) => {
      setSending(false);
      if (timeoutError) {
        setError('Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.');
      } else if (response?.error) {
        setError(response.error);
      } else if (response) {
        update(response);
      }
    });
  };

  const submitMessage = (event) => {
    event.preventDefault();
    if (!message.trim() || sending) return;
    sendSocketEvent('chat:send-message', { conversationId, content: message }, ({ message: saved }) => {
      setMessages((current) => current.some((item) => item.id === saved.id) ? current : [...current, saved]);
      setMessage('');
    });
  };

  const submitProposal = (event) => {
    event.preventDefault();
    if (!amount || sending) return;
    sendSocketEvent('chat:send-proposal', { conversationId, amount }, ({ proposal }) => {
      setProposals((current) => current.some((item) => item.id === proposal.id) ? current : [...current, proposal]);
      setAmount('');
    });
  };

  const respondToProposal = async (proposal, action) => {
    setActingProposal(proposal.id);
    setError('');
    try {
      const { data } = await api.post(`/api/chats/${conversationId}/proposals/${proposal.id}/${action}`);
      if (action === 'accept') {
        setConversationStatus('ACCEPTEE');
        setProposals((current) => current.map((item) => item.statut === 'EN_ATTENTE'
          ? { ...item, statut: item.id === proposal.id ? 'ACCEPTEE' : 'REFUSEE' }
          : item));
        onCourseAccepted?.(data.course);
      } else {
        setProposals((current) => current.map((item) => item.id === proposal.id ? data.proposal : item));
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible de répondre à cette proposition.');
    } finally {
      setActingProposal(null);
    }
  };

  const chatPanel = <section role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : true} aria-labelledby="negotiation-chat-title" className={`flex min-w-0 flex-col overflow-hidden bg-white ${embedded ? 'h-full min-h-0 flex-1' : 'max-h-[92vh] w-full max-w-2xl rounded-3xl border border-slate-200 shadow-2xl'}`}>
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#0C1B32] text-xs font-bold text-white">{(counterpartName || 'T').split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}</span>
          <div className="min-w-0"><h2 id="negotiation-chat-title" className="truncate font-bold text-brand-dark">{embedded ? 'Négociation du prix' : counterpartName || 'Négociation'}</h2><p className="truncate text-xs text-slate-500">{counterpartName || 'Transporteur'} · {conversation.ville_depart} → {conversation.ville_arrivee}</p></div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`hidden rounded-full px-2.5 py-1 text-[10px] font-bold sm:inline-flex ${isOpen ? 'bg-orange-50 text-orange-700' : conversationStatus === 'ACCEPTEE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{isOpen ? 'En cours' : conversationStatus === 'ACCEPTEE' ? 'Prix accepté' : 'Terminée'}</span>
          <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${socketReady ? 'text-emerald-700' : 'text-amber-700'}`}><span className={`h-2 w-2 rounded-full ${socketReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />{socketReady ? 'En direct' : 'Connexion…'}</span>
          <button type="button" onClick={onClose} aria-label={embedded ? 'Retour aux négociations' : 'Fermer le chat'} className={`flex shrink-0 items-center gap-1.5 rounded-lg p-2 text-slate-500 hover:bg-slate-100 ${embedded ? 'text-xs font-semibold' : ''}`}>{embedded ? <><ArrowLeft size={17} /><span className="hidden sm:inline">Retour</span></> : <X size={18} />}</button>
        </div>
      </header>
      <div className="border-b border-slate-100 px-5 py-3 text-xs text-slate-600"><span className="font-bold">Camion :</span> {conversation.type_vehicule} · {conversation.capacite_tonnes} t · {conversation.plaque_immatriculation}</div>
      <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-white px-5 py-4">
        <div><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Montant actuel</p><p className="mt-1 text-sm font-extrabold text-brand-dark">{formatPrice(conversation.prix_propose)} FCFA</p></div>
        <div className="border-l border-slate-100 pl-4"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Dernière proposition</p><p className="mt-1 text-sm font-extrabold text-brand-orange">{latestProposal ? `${formatPrice(latestProposal.montant)} FCFA` : 'Aucune'}</p></div>
      </div>
      <div className="min-h-40 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4 sm:p-5" aria-live="polite">
        {historyLoading && <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin" />Chargement de la conversation…</div>}
        {!historyLoading && timeline.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Démarrez la négociation par un message ou une proposition de prix.</p>}
        {!historyLoading && timeline.map((item) => {
          const ownMessage = String(item.kind === 'message' ? item.expediteur_id : item.proposant_id) === String(user?.id);
          if (item.kind === 'proposal') {
            return <article key={`proposal-${item.id}`} className={`max-w-[90%] rounded-2xl border p-4 ${ownMessage ? 'ml-auto border-orange-200 bg-orange-50' : 'mr-auto border-emerald-200 bg-white'}`}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{ownMessage ? 'Votre proposition' : `${item.proposant_nom || counterpartName || 'Votre interlocuteur'} propose`}</p>
              <p className="mt-1 text-lg font-extrabold text-brand-dark">{formatPrice(item.montant)} FCFA</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{proposalLabel(item.statut)}</p>
              {!ownMessage && item.statut === 'EN_ATTENTE' && isOpen && <div className="mt-3 flex gap-2">
                <button type="button" disabled={actingProposal === item.id} onClick={() => respondToProposal(item, 'accept')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Check size={14} />Accepter et affecter</button>
                <button type="button" disabled={actingProposal === item.id} onClick={() => respondToProposal(item, 'reject')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">Refuser</button>
              </div>}
            </article>;
          }
          return <article key={`message-${item.id}`} className={`max-w-[85%] rounded-2xl px-4 py-3 ${ownMessage ? 'ml-auto rounded-br-md bg-brand-dark text-white' : 'mr-auto rounded-bl-md border border-slate-200 bg-white text-brand-dark'}`}>
            <p className={`mb-1 text-[10px] font-bold ${ownMessage ? 'text-white/70' : 'text-slate-500'}`}>{ownMessage ? 'Vous' : item.expediteur_nom || counterpartName || 'Interlocuteur'}</p>
            <p className="whitespace-pre-wrap wrap-break-word text-sm">{item.contenu}</p>
            <p className={`mt-1 text-right text-[10px] ${ownMessage ? 'text-white/60' : 'text-slate-400'}`}>{formatTime(item.date_creation)}</p>
          </article>;
        })}
      </div>
      {error && <p role="alert" className="border-t border-rose-100 bg-rose-50 px-5 py-2 text-xs text-rose-700">{error}</p>}
      {conversationStatus === 'ACCEPTEE' && <p className="flex items-center gap-2 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800"><CheckCircle2 size={17} />Prix accepté : le camion est affecté à cette course.</p>}
      {isOpen && <div className="space-y-3 border-t border-slate-100 bg-white p-4">
        <form onSubmit={submitProposal} className="flex gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/70 px-3"><span className="text-xs font-bold text-slate-500">Prix FCFA</span><input type="number" min="1" step="1" required value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Montant à proposer" placeholder="Ex. 250000" className="min-w-0 flex-1 border-0 bg-transparent py-2.5 text-sm font-semibold outline-none" /></label>
          <button type="submit" disabled={sending || !socketReady} className="inline-flex items-center gap-2 rounded-xl bg-brand-orange px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Send size={14} />Proposer</button>
        </form>
        <form onSubmit={submitMessage} className="flex gap-2">
          <input value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} aria-label="Votre message" placeholder="Écrire un message…" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand-orange" />
          <button type="submit" disabled={sending || !socketReady || !message.trim()} aria-label="Envoyer le message" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-dark text-white disabled:opacity-50"><Send size={16} /></button>
        </form>
      </div>}
    </section>;
  return embedded ? chatPanel : <div className="fixed inset-0 z-90 flex items-center justify-center bg-brand-dark/60 p-3 backdrop-blur-sm sm:p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>{chatPanel}</div>;
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString('fr-FR');
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
}

function proposalLabel(status) {
  return { EN_ATTENTE: 'En attente de réponse', ACCEPTEE: 'Prix accepté', REFUSEE: 'Proposition refusée' }[status] || status;
}
