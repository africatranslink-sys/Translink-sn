import { LayoutDashboard, Users, Settings, FileText, Search, History, Truck, MapPin, Package, ReceiptText, CreditCard } from 'lucide-react';
import { ADMIN_SIDEBAR_ITEMS } from './adminNavigation';
export const getSidebarItems = (role, user = {}) => {
  switch (role) {
    case 'ADMIN': return ADMIN_SIDEBAR_ITEMS;
    case 'ENTREPRISE': return [
      { label: 'Tableau de bord', icon: LayoutDashboard, href: '/transporteur' },
      { label: 'Mes camions', icon: Truck, href: '/transporteur/camions' },
      { label: 'Suivi de flotte', icon: MapPin, href: '/transporteur/suivi' },
      { label: 'Publier un trajet', icon: MapPin, href: '/transporteur/disponibilite/nouveau' },
      { label: 'Mes chauffeurs', icon: Users, href: '/transporteur/chauffeurs' },
      { label: 'Offres', icon: Search, href: '/transporteur/recherche' },
      { label: 'Courses', icon: Package, href: '/transporteur/courses' },
      { label: 'Historique', icon: History, href: '/transporteur/historique' },
      { label: 'Transactions', icon: ReceiptText, href: '/transactions' },
      { label: 'Abonnement', icon: CreditCard, href: '/abonnement' },
      { label: 'Documents', icon: FileText, href: '/transporteur/documents' },
      { label: 'Paramètres', icon: Settings, href: '/profile' },
    ];
    case 'TRANSPORTEUR': return [
      { label: 'Tableau de bord', icon: LayoutDashboard, href: '/transporteur' },
      { label: 'Mes camions', icon: Truck, href: '/transporteur/camions' },
      { label: 'Suivi de flotte', icon: MapPin, href: '/transporteur/suivi' },
      { label: 'Publier un trajet', icon: MapPin, href: '/transporteur/disponibilite/nouveau' },
      { label: 'Mes chauffeurs', icon: Users, href: '/transporteur/chauffeurs' },
      { label: 'Offres', icon: Search, href: '/transporteur/recherche' },
      { label: 'Courses', icon: Package, href: '/transporteur/courses' },
      { label: 'Historique', icon: History, href: '/transporteur/historique' },
      { label: 'Transactions', icon: ReceiptText, href: '/transactions' },
      { label: 'Abonnement', icon: CreditCard, href: '/abonnement' },
      { label: 'Documents', icon: FileText, href: '/transporteur/documents' },
      { label: 'Paramètres', icon: Settings, href: '/profile' },
    ];
    case 'CHARGEUR': return [
      { label: 'Tableau de bord', icon: LayoutDashboard, href: '/chargeur' },
      { label: 'Mes demandes', icon: FileText, href: '/chargeur/demandes' },
      { label: 'Trouver un camion', icon: Search, href: '/chargeur/recherche' },
      { label: 'Historique', icon: History, href: '/chargeur/historique' },
      { label: 'Transactions', icon: ReceiptText, href: '/transactions' },
      { label: 'Documents', icon: FileText, href: '/chargeur/documents' },
      { label: 'Paramètres', icon: Settings, href: '/profile' },
    ];
    case 'CHAUFFEUR': return [
      { label: 'Tableau de bord', icon: LayoutDashboard, href: '/chauffeur' },
      { label: 'Mon camion', icon: Truck, href: '/chauffeur/camions' },
      ...(!user.employeur_id ? [{ label: 'Offres', icon: Search, href: '/chauffeur/recherche' }] : []),
      { label: 'Mes missions', icon: Package, href: '/chauffeur/missions' },
      { label: 'Suivi de position', icon: MapPin, href: '/chauffeur/suivi' },
      ...(!user.employeur_id ? [{ label: 'Publier un trajet', icon: MapPin, href: '/chauffeur/disponibilite/nouveau' }] : []),
      { label: 'Historique', icon: History, href: '/chauffeur/historique' },
      { label: 'Transactions', icon: ReceiptText, href: '/transactions' },
      { label: 'Abonnement', icon: CreditCard, href: '/abonnement' },
      { label: 'Paramètres', icon: Settings, href: '/profile' },
    ];
    default: return [];
  }
};
export const getDashboardUrl = (role) => {
  if (role === 'ADMIN') return '/admin';
  if (role === 'TRANSPORTEUR' || role === 'ENTREPRISE') return '/transporteur';
  if (role === 'CHARGEUR') return '/chargeur';
  if (role === 'CHAUFFEUR') return '/chauffeur';
  return '/';
};
