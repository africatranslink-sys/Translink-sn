import React from 'react';
import { NavLink } from 'react-router-dom';
import { Truck } from 'lucide-react';

export default function Sidebar({ items }) {
  return (
    <div className="w-64 bg-brand-dark min-h-screen flex flex-col text-white fixed">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-brand-orange p-1.5 rounded-md">
          <Truck size={24} className="text-white" />
        </div>
        <span className="text-xl font-bold tracking-wide">TRANSLINK-AFRICA<span className="text-brand-orange text-xs block -mt-1 font-normal tracking-normal">LOGISTICS</span></span>
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-2">
        {items.map((item, index) => (
          <NavLink
            key={index}
            to={item.href}
            className={({ isActive }) => 
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive 
                  ? 'bg-white/10 text-white font-medium' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
