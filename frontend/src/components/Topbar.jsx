import React from 'react';
import { Bell } from 'lucide-react';

export default function Topbar({ user }) {
  return (
    <div className="sticky top-0 z-10 flex h-20 items-center justify-end border-b border-gray-100 bg-white px-8">
      <div className="flex items-center gap-6">
        <button className="relative p-2 text-gray-500 hover:text-brand-orange hover:bg-orange-50 rounded-full transition-colors">
          <Bell size={22} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        
        <div className="flex items-center gap-3 border-l border-gray-100 pl-6">
          <img 
            src={user?.avatar || "https://ui-avatars.com/api/?name=" + (user?.name || "User") + "&background=F97316&color=fff"} 
            alt="Profile" 
            className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"
          />
          <div>
            <p className="text-sm font-semibold text-slate-800">{user?.name || "Utilisateur"}</p>
            <p className="text-xs text-gray-500">{user?.company || "Translink-Africa"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
