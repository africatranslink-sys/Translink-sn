import { Bell, FileCheck2, History, KeyRound, LayoutDashboard, Mail, MapPin, Megaphone, Server, Settings, Users } from 'lucide-react';

export const ADMIN_SIDEBAR_ITEMS = [
  { label: 'Vue générale', icon: LayoutDashboard, href: '/admin' },
  { label: 'Utilisateurs', icon: Users, href: '/admin/utilisateurs' },
  { label: 'Documents à vérifier', icon: FileCheck2, href: '/admin/documents' },
  { label: 'Annonces', icon: Megaphone, href: '/admin/annonces' },
  { label: 'Newsletter', icon: Mail, href: '/admin/newsletter' },
  { label: 'Maps', icon: MapPin, href: '/admin/suivi' },
  { label: 'Signalements', icon: Bell, href: '/admin/signalements' },
  { label: 'Transactions', icon: History, href: '/admin/transactions' },
  { label: 'Services externes', icon: KeyRound, href: '/admin/services' },
  { label: 'État du serveur', icon: Server, href: '/admin/serveur' },
  { label: 'Paramètres', icon: Settings, href: '/profile' },
];