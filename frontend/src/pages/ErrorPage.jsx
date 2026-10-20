import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock3, Home, LockKeyhole, Radio, ShieldAlert, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getDashboardUrl } from '../utils/navigation';
import ErrorTelevision from '../components/ErrorTelevision';
import './ErrorPage.css';

const ERROR_COPY = {
  'not-found': {
    code: '404',
    label: 'Page introuvable',
    title: 'Cette page n’existe pas.',
    message: 'Le lien est peut-être incorrect ou la page a été déplacée.',
    Icon: Radio,
  },
  'access-denied': {
    code: '403',
    label: 'Accès refusé',
    title: 'Vous ne pouvez pas accéder à cet espace.',
    message: 'Votre compte ne dispose pas des autorisations nécessaires.',
    Icon: ShieldAlert,
  },
  'session-expired': {
    code: '401',
    label: 'Session expirée',
    title: 'Reconnectez-vous pour continuer.',
    message: 'Votre session a expiré. Après connexion, vous retrouverez la page demandée.',
    Icon: LockKeyhole,
  },
  'service-unavailable': {
    code: '503',
    label: 'Service indisponible',
    title: 'Impossible de joindre le service.',
    message: 'Vérifiez votre connexion puis réessayez.',
    Icon: WifiOff,
  },
  'server-error': {
    code: '500',
    label: 'Erreur serveur',
    title: 'Cette opération n’a pas abouti.',
    message: 'Une erreur est survenue pendant le traitement de votre demande.',
    Icon: WifiOff,
  },
};

function safeReturnLocation(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return { pathname: '/' };
  const [pathname, ...queryParts] = value.split('?');
  const search = queryParts.length ? `?${queryParts.join('?').split('#')[0]}` : '';
  const hash = value.includes('#') ? `#${value.split('#').slice(1).join('#')}` : '';
  return { pathname, search, hash };
}

export default function ErrorPage({ type: suppliedType }) {
  const { type: routeType } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, clearSession } = useAuth();
  const type = suppliedType || routeType || 'not-found';
  const details = ERROR_COPY[type] || ERROR_COPY['not-found'];
  const returnTo = searchParams.get('returnTo');
  const [secondsRemaining, setSecondsRemaining] = useState(10);
  const didRedirect = useRef(false);
  const fallbackPath = location.state?.fallback || getDashboardUrl(user?.role);

  const redirect = useCallback(() => {
    if (didRedirect.current) return;
    didRedirect.current = true;

    if (type === 'session-expired' || type === 'service-unavailable') {
      const from = safeReturnLocation(returnTo);
      clearSession();
      navigate('/login', { replace: true, state: { from } });
      return;
    }

    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate(fallbackPath || '/', { replace: true });
    }
  }, [clearSession, fallbackPath, navigate, returnTo, type]);

  useEffect(() => {
    if (secondsRemaining === 0) {
      redirect();
      return undefined;
    }
    const timer = window.setTimeout(() => setSecondsRemaining((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [redirect, secondsRemaining]);

  const { Icon } = details;

  return (
    <main className="error-page">
      <section className="error-layout" aria-labelledby="error-title">
        <ErrorTelevision code={details.code} label={details.label} Icon={Icon} />

        <div className="error-copy">
          <p className="error-eyebrow">Translink-Africa · {details.code}</p>
          <h1 id="error-title">{details.title}</h1>
          <p className="error-message">{details.message}</p>
          <div className="error-countdown" role="status" aria-live="polite">
            <Clock3 size={17} />
            <span>Retour automatique dans</span>
            <strong>{secondsRemaining} s</strong>
          </div>
          <div className="error-progress" aria-hidden="true"><span style={{ width: `${secondsRemaining * 10}%` }} /></div>
          <div className="error-actions">
            <button type="button" onClick={redirect} className="error-primary"><ArrowLeft size={17} /> Revenir maintenant</button>
            {type !== 'session-expired' && type !== 'service-unavailable' && <button type="button" onClick={() => navigate(getDashboardUrl(user?.role) || '/', { replace: true })} className="error-secondary"><Home size={16} /> Tableau de bord</button>}
          </div>
        </div>
      </section>
    </main>
  );
}
