import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './CountrySelect.css';
import { africanCountries } from '../utils/africanCountries';
import { useLanguage } from '../context/useLanguage';

const englishRegionNames = new Intl.DisplayNames(['en'], { type: 'region' });

const getCountryFlagCode = (flag) => Array.from(flag)
  .map((character) => character.codePointAt(0))
  .filter((codePoint) => codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff)
  .map((codePoint) => String.fromCharCode(codePoint - 0x1f1a5))
  .join('')
  .toLowerCase();

export default function CountrySelect({ value, onChange, countries = africanCountries, className = 'w-[43%]', ariaLabel = 'Pays africains' }) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selectedCountry = countries.find((country) => country.code === value) || countries.find((country) => country.code === '+221') || countries[0];
  const getCountryName = (country) => {
    if (language !== 'en') return country.name;
    const regionCode = getCountryFlagCode(country.flag).toUpperCase();
    return englishRegionNames.of(regionCode) || country.name;
  };

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const selectCountry = (country) => {
    onChange(country.code);
    setOpen(false);
  };

  return <div ref={containerRef} className={`relative ${className} shrink-0`}>
    <button type="button" className="flex h-full min-h-[50px] w-full items-center gap-1 rounded-l-lg border border-r-0 border-gray-300 bg-white px-2 text-left text-sm focus:border-[#FF6A3D] focus:outline-none focus:ring-1 focus:ring-[#FF6A3D]" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
      <span className={`country-flag country-flag-${getCountryFlagCode(selectedCountry.flag)} text-lg`} role="img" aria-label={getCountryName(selectedCountry)} /><span className="truncate">{selectedCountry.code}</span><ChevronDown size={15} className={`ml-auto shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && <div className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-72 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-xl" role="listbox" aria-label={ariaLabel}>
      {countries.map((country) => <button type="button" role="option" aria-selected={country.code === value} key={country.code} onClick={() => selectCountry(country)} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-slate-700 hover:bg-orange-50"><span className="w-7 text-center"><span className={`country-flag country-flag-${getCountryFlagCode(country.flag)} text-xl`} role="img" aria-label={getCountryName(country)} /></span><span className="flex-1">{getCountryName(country)}</span><span className="font-medium text-slate-500">{country.code}</span>{country.code === value && <Check size={15} className="text-[#FF6A3D]" />}</button>)}
    </div>}
  </div>;
}
