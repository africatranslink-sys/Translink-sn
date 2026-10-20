import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDashboardUrl } from '../utils/navigation';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Chargement...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.statut_verification !== 'VALIDE') {
    return <Navigate to="/login" state={{ accountStatus: user.statut_verification }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/erreur/access-denied" state={{ fallback: getDashboardUrl(user.role) }} replace />;
  }

  return children;
}
