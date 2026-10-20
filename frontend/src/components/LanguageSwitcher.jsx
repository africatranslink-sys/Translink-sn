import { Languages } from 'lucide-react';
import { useLanguage } from '../context/useLanguage';

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      type="button"
      onClick={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
      data-language-switcher
      className="fixed bottom-5 right-5 z-[100] inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-lg transition hover:border-orange-300 hover:text-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400"
      aria-label={language === 'fr' ? 'Switch language to English' : 'Changer la langue en français'}
      title={language === 'fr' ? 'Switch language to English' : 'Changer la langue en français'}
    >
      <Languages size={18} aria-hidden="true" />
      {language === 'fr' ? 'FR · Français' : 'EN · English'}
    </button>
  );
}
