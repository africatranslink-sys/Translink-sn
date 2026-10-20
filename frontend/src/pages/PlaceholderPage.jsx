import React from 'react';
import DashboardLayout from '../layouts/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { Construction } from 'lucide-react';

export default function PlaceholderPage({ title }) {
  const { user } = useAuth();

  return (
    <DashboardLayout sidebarItems={[]} user={user}>
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="w-24 h-24 bg-orange-100 text-[#FF6A3D] rounded-full flex items-center justify-center mb-6">
          <Construction size={48} />
        </div>
        <h1 className="text-3xl font-bold text-[#121C2D] mb-4">{title}</h1>
        <p className="text-lg text-slate-500 max-w-lg mx-auto">
          Cette page est actuellement en cours de construction. Veuillez revenir plus tard !
        </p>
      </div>
    </DashboardLayout>
  );
}
