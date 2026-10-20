import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './CountrySelect.css';

export const CitySelectLockContext = createContext(false);

const FLAGS_BY_COUNTRY = {
  'Côte d’Ivoire': 'ci',
  'Ghana': 'gh',
  'Mali': 'ml',
  'Gambie': 'gm',
  'Burkina Faso': 'bf',
  'Guinée-Bissau': 'gw',
  'Bénin': 'bj',
  'Guinée': 'gn',
  'Sénégal': 'sn',
  'Sierra Leone': 'sl',
  'Nigeria': 'ng',
  'Togo': 'tg',
  'Niger': 'ne',
  'Mauritanie': 'mr',
  'Côte d’Ivoire': 'ci'
};

const getFlagClassName = (cityName) => {
  const countryName = cityName?.split(', ').pop() || '';
  const flagKey = FLAGS_BY_COUNTRY[countryName] || 'fr';
  return `country-flag country-flag-${flagKey}`;
};

export default function CitySelect({ value, onChange, options, placeholder = 'Choisir une ville', className = 'w-full', label = null, disabled = false }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const isDisabled = disabled || useContext(CitySelectLockContext);
  const selectedCity = options.find((city) => city.name === value) || null;

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (isDisabled) setOpen(false);
  }, [isDisabled]);

  return <div ref={containerRef} className={`relative ${className}`}>
    {label && <span className="mb-1.5 block text-sm font-bold text-[#123b4a]">{label}</span>}
    <button type="button" disabled={isDisabled} className="flex h-full min-h-[50px] w-full items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm focus:border-[#FF6A3D] focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open && !isDisabled}>
      {selectedCity ? <><span className={getFlagClassName(selectedCity.name)} role="img" aria-label={selectedCity.name} /><span className="flex-1 truncate">{selectedCity.name}</span></> : <><span className="inline-block h-4 w-4 rounded-sm bg-slate-200" /> <span className="text-slate-500">{placeholder}</span></>}
      <ChevronDown size={15} className={`ml-auto shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && !isDisabled && <div className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-xl" role="listbox" aria-label={placeholder}>
      <button type="button" role="option" disabled={isDisabled} aria-selected={!selectedCity} onClick={() => { onChange(''); setOpen(false); }} className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${!selectedCity ? 'bg-orange-50 text-[#121C2D]' : 'text-slate-700 hover:bg-orange-50'}`}>
        <span className="w-7 text-center"><span className="country-flag country-flag-fr" role="img" aria-label="Toutes les villes" /></span>
        <span className="flex-1">Toutes les villes</span>
        {!selectedCity && <Check size={15} className="text-[#FF6A3D]" />}
      </button>
      {options.map((city) => <button type="button" role="option" disabled={isDisabled} aria-selected={city.name === value} key={city.name} onClick={() => { onChange(city.name); setOpen(false); }} className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${city.name === value ? 'bg-orange-50 text-[#121C2D]' : 'text-slate-700 hover:bg-orange-50'}`}>
        <span className="w-7 text-center"><span className={getFlagClassName(city.name)} role="img" aria-label={city.name} /></span>
        <span className="flex-1">{city.name}</span>
        {city.name === value && <Check size={15} className="text-[#FF6A3D]" />}
      </button>)}
    </div>}
  </div>;
}
