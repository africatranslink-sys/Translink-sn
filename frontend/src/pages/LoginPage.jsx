import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Truck } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import CountrySelect from '../components/CountrySelect';
import { useAutoDismissMessage } from '../utils/useAutoDismissMessage';
import { getDashboardUrl } from '../utils/navigation';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  
  const [formData, setFormData] = useState({
    identifiant: '',
    mot_de_passe: ''
  });
  const [countryCode, setCountryCode] = useState('+221');
  const [loginMethod, setLoginMethod] = useState('email');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useAutoDismissMessage('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/api/auth/login', {
        ...formData,
        identifiant: loginMethod === 'email'
          ? formData.identifiant
          : `${countryCode}${formData.identifiant.replace(/\D/g, '')}`
      });
      const { user, token } = response.data;
      login(user, token);
      
      const requestedLocation = location.state?.from;
      const requestedPath = typeof requestedLocation === 'string'
        ? requestedLocation
        : requestedLocation?.pathname
          ? `${requestedLocation.pathname}${requestedLocation.search || ''}${requestedLocation.hash || ''}`
          : '';
      const requestedPathname = requestedPath.split(/[?#]/, 1)[0];
      const rolePath = {
        ADMIN: '/admin',
        CHARGEUR: '/chargeur',
        TRANSPORTEUR: '/transporteur',
        ENTREPRISE: '/transporteur',
        CHAUFFEUR: '/chauffeur',
      }[user.role];
      const sharedPaths = ['/profile', '/transactions'];
      const canRestoreRequestedPath = requestedPathname && (
        sharedPaths.some((path) => requestedPathname === path || requestedPathname.startsWith(`${path}/`))
        || rolePath && (requestedPathname === rolePath || requestedPathname.startsWith(`${rolePath}/`))
      );
      const from = canRestoreRequestedPath ? requestedPath : getDashboardUrl(user.role);
      navigate('/login/loading', { replace: true, state: { to: from } });
    } catch (err) {
      setError(err.response?.data?.error || (err.request
        ? 'Le serveur est injoignable. Vérifiez que votre téléphone et l’ordinateur sont sur le même réseau Wi-Fi et que l’accès réseau est autorisé.'
        : 'Erreur lors de la connexion. Vérifiez vos identifiants.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-800">
      {/* Left Panel */}
      <div className="hidden lg:flex flex-col w-5/12 bg-[#121C2D] text-white p-12 relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF6A3D] rounded-full blur-[100px] opacity-20 -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500 rounded-full blur-[120px] opacity-20 -ml-20 -mb-20"></div>

        <Link to="/" className="flex items-center gap-2 mb-16 relative z-10">
          <div className="bg-[#FF6A3D] p-1.5 rounded text-white">
            <Truck size={24} />
          </div>
          <span className="text-xl font-bold tracking-tight leading-none">TRANSLINK-AFRICA</span>
        </Link>

        <div className="relative z-10 flex-1 flex flex-col justify-center">
          <h1 className="text-4xl font-bold mb-6 leading-tight">Bon retour sur Translink-Africa</h1>
          <p className="text-slate-400 text-lg mb-10">Connectez-vous pour gérer vos expéditions ou vos camions, suivre vos paiements et plus encore.</p>
        </div>
        
        <div className="relative z-10 text-slate-500 text-sm">
          &copy; {new Date().getFullYear()} Translink-Africa Logistique. Tous droits réservés.
        </div>
      </div>

      {/* Right Panel */}
      <div className="w-full lg:w-7/12 flex flex-col justify-center px-10 sm:px-20 py-12 relative">
        <div className="max-w-md w-full mx-auto">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center gap-2 mb-12">
            <div className="bg-[#FF6A3D] p-1.5 rounded text-white">
              <Truck size={24} />
            </div>
            <span className="text-xl font-bold tracking-tight leading-none text-[#121C2D]">TRANSLINK-AFRICA</span>
          </div>

          <h2 className="text-3xl font-bold text-[#121C2D] mb-2">Se connecter</h2>
          <p className="text-slate-500 mb-8">Entrez vos identifiants pour accéder à votre espace.</p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <div className="mb-2 flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Méthode de connexion">
                <button type="button" role="tab" aria-selected={loginMethod === 'email'} onClick={() => { setLoginMethod('email'); setFormData({ ...formData, identifiant: '' }); }} className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${loginMethod === 'email' ? 'bg-white text-[#FF6A3D] shadow-sm' : 'text-slate-500'}`}>Email</button>
                <button type="button" role="tab" aria-selected={loginMethod === 'phone'} onClick={() => { setLoginMethod('phone'); setFormData({ ...formData, identifiant: '' }); }} className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${loginMethod === 'phone' ? 'bg-white text-[#FF6A3D] shadow-sm' : 'text-slate-500'}`}>Téléphone</button>
              </div>
              <label className="block text-sm font-semibold text-[#121C2D] mb-1.5">{loginMethod === 'email' ? 'Adresse email' : 'Numéro WhatsApp'}</label>
              <div className="flex">{loginMethod === 'phone' && <CountrySelect value={countryCode} onChange={setCountryCode} />}<input type={loginMethod === 'email' ? 'email' : 'tel'} name="identifiant" value={formData.identifiant} onChange={handleChange} placeholder={loginMethod === 'email' ? 'exemple@domaine.com' : '77 000 00 00'} inputMode={loginMethod === 'email' ? 'email' : 'tel'} required className={`${loginMethod === 'phone' ? 'w-[57%] rounded-r-lg' : 'w-full rounded-lg'} border border-gray-300 px-3 py-3 outline-none transition-all placeholder:text-slate-400 focus:border-[#FF6A3D] focus:ring-1 focus:ring-[#FF6A3D]`} /></div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-[#121C2D]">Mot de passe</label>
                <a href="#" className="text-[#FF6A3D] text-sm hover:underline">Mot de passe oublié ?</a>
              </div>
              <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'}
                name="mot_de_passe"
                value={formData.mot_de_passe}
                onChange={handleChange}
                placeholder="••••••••" 
                required
                className="w-full px-4 py-3 pr-12 rounded-lg border border-gray-300 focus:border-[#FF6A3D] focus:ring-1 focus:ring-[#FF6A3D] outline-none transition-all placeholder:text-slate-400"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#FF6A3D]" aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[#FF6A3D] text-white font-bold py-3.5 rounded-lg hover:bg-[#e85b2d] transition shadow-[0_4px_14px_0_rgba(255,106,61,0.39)] hover:shadow-[0_6px_20px_rgba(255,106,61,0.23)] hover:-translate-y-0.5 duration-200 flex justify-center items-center"
            >
              {loading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>


          <p className="text-center mt-8 text-sm text-slate-600">
            Vous n'avez pas de compte ? <Link to="/register" className="text-[#FF6A3D] font-bold hover:underline">S'inscrire</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
