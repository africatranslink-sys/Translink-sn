import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Loader from '../components/Loader';

export default function LoginLoadingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const destination = location.state?.to || getDefaultDestination();

  useEffect(() => {
    const timer = window.setTimeout(() => navigate(destination, { replace: true }), 5000);
    return () => window.clearTimeout(timer);
  }, [destination, navigate]);

  return (
    <main className="login-loading-page">
      <Loader label="Connexion en cours..." />
    </main>
  );
}

function getDefaultDestination() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (user?.role === 'ADMIN') return '/admin';
  if (user?.role === 'TRANSPORTEUR' || user?.role === 'ENTREPRISE') return '/transporteur';
  return '/chargeur';
}
