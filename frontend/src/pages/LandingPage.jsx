import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Check, MapPin, ChevronRight, Star, Quote, Anchor, Droplet, Box, Coins, PackageOpen, FileText, ArrowLeftRight, Smartphone, User, Menu, X, ArrowUpRight } from 'lucide-react';

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    const revealObserver = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      }),
      { threshold: 0.12 }
    );

    document.querySelectorAll('.reveal-on-scroll').forEach((element) => revealObserver.observe(element));
    return () => revealObserver.disconnect();
  }, []);

  const navigation = [
    { label: 'Accueil', href: '#accueil' },
    { label: 'Comment ça marche ?', href: '#fonctionnement' },
    { label: 'Corridors', href: '#corridors' },
    { label: 'Tarifs', href: '#tarifs' },
    { label: 'FAQ', href: '#faq' },
  ];

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="bg-white min-h-screen font-sans text-slate-800">
      {/* HEADER */}
      <header className="site-header flex items-center justify-between px-6 md:px-10 py-5 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-md z-50">
        <div className="flex items-center gap-2">
          <div className="bg-[#FF6A3D] p-1.5 rounded text-white">
            <Truck size={24} />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold text-[#121C2D] tracking-tight leading-none block">TRANSLINK-AFRICA</span>
            <span className="text-[#FF6A3D] text-[9px] font-bold uppercase tracking-widest mt-0.5 leading-none block">LOGISTICS</span>
          </div>
        </div>
        
        <nav className="hidden md:flex gap-8 text-sm font-semibold text-[#121C2D]" aria-label="Navigation principale">
          {navigation.map((item) => <a key={item.href} href={item.href} className="nav-link" onClick={closeMenu}>{item.label}</a>)}
        </nav>
        
        <div className="hidden md:flex items-center gap-6 text-sm font-semibold">
          <Link to="/login" className="text-[#121C2D] hover:text-[#FF6A3D]">Se connecter</Link>
          <Link to="/register" className="bg-[#FF6A3D] text-white px-6 py-2.5 rounded hover:bg-[#e85b2d] transition-colors">Créer un compte</Link>
        </div>
        <button type="button" className="md:hidden text-[#121C2D] p-2" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menuOpen}>
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <div className={`mobile-menu md:hidden ${menuOpen ? 'mobile-menu-open' : ''}`}>
          {navigation.map((item) => <a key={item.href} href={item.href} onClick={closeMenu}>{item.label}</a>)}
          <Link to="/login" onClick={closeMenu}>Se connecter</Link>
          <Link to="/register" className="mobile-menu-cta" onClick={closeMenu}>Créer un compte <ArrowUpRight size={16} /></Link>
        </div>
      </header>

      {/* HERO SECTION */}
      <section id="accueil" className="hero-section bg-[#121C2D] text-white pt-24 pb-20 px-6 md:px-10 relative overflow-hidden">
        <div className="hero-grid" aria-hidden="true"></div>
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12 relative z-10">
          <div className="flex-1 space-y-6 hero-copy">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-slate-300">
              <span className="text-white font-bold">NOUVEAU</span>
              <span className="w-1 h-1 rounded-full bg-slate-500"></span>
              Plateforme Leader en Afrique de l'Ouest
            </div>
            <h1 className="text-5xl lg:text-6xl font-bold leading-tight">Trouvez un camion en <br/>moins de 2 heures</h1>
            <p className="text-slate-400 text-lg max-w-lg leading-relaxed">
              La solution numérique incontournable du fret ouest-africain. Mettez en relation vos marchandises avec des transporteurs professionnels vérifiés et optimisez vos trajets inter-États.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Link to="/register?role=CHARGEUR" className="button-lift bg-[#FF6A3D] text-white px-8 py-4 rounded font-bold hover:bg-[#e85b2d] transition text-center text-lg">
                Je cherche un transporteur
              </Link>
              <Link to="/register?role=TRANSPORTEUR" className="button-lift bg-transparent text-white border border-white/30 px-8 py-4 rounded font-bold hover:bg-white/10 transition text-center text-lg">
                Je suis transporteur
              </Link>
            </div>
          </div>
          <div className="flex-1 w-full relative hidden lg:block hero-visual">
            <div className="w-full h-[450px] rounded-xl overflow-hidden relative border border-white/10 shadow-2xl">
               <img src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80" alt="Camion sur la route" className="w-full h-full object-cover" />
               <div className="absolute inset-0 bg-gradient-to-t from-[#121C2D] via-transparent to-transparent opacity-80"></div>
               <div className="absolute bottom-6 right-6 bg-[#121C2D]/90 backdrop-blur p-4 rounded-xl border border-white/10 flex items-center gap-4">
                 <div className="bg-white/10 p-2.5 rounded-full text-white">
                    <Truck size={20} />
                 </div>
                 <div>
                   <p className="text-white font-bold text-sm">12 camions disponibles</p>
                   <p className="text-slate-400 text-xs">Axe Dakar - Bamako</p>
                 </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS BANNER */}
      <div className="bg-[#FF6A3D] text-white py-10 reveal-on-scroll">
        <div className="max-w-7xl mx-auto px-10 flex flex-wrap justify-between items-center text-center gap-8">
          <div className="flex-1">
            <p className="text-4xl font-bold mb-1">500+</p>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-100">Clients satisfaits</p>
          </div>
          <div className="flex-1 border-l border-white/20">
            <p className="text-4xl font-bold mb-1">2 heures</p>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-100">Temps d'attente moyen</p>
          </div>
          <div className="flex-1 border-l border-white/20">
            <p className="text-4xl font-bold mb-1">95%</p>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-100">Taux de satisfaction</p>
          </div>
          <div className="flex-1 border-l border-white/20">
            <p className="text-4xl font-bold mb-1">Dakar-Bamako</p>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-100">Le trajet vedette</p>
          </div>
        </div>
      </div>
      
      {/* COMMENT CA MARCHE */}
      <section id="fonctionnement" className="py-24 px-6 md:px-10 bg-[#FAFAFA] reveal-on-scroll">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-[#FF6A3D] font-bold text-xs uppercase tracking-widest mb-3">SIMPLE ET EFFICACE</p>
            <h2 className="text-3xl font-bold text-[#121C2D]">Comment fonctionne la plateforme ?</h2>
            <p className="text-slate-500 mt-4 max-w-2xl mx-auto">Un processus simplifié et sécurisé pour connecter les expéditeurs et les transporteurs.</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 stagger-children">
            {/* Chargeur */}
            <div className="bg-white rounded-2xl p-10 border border-gray-100 shadow-sm relative hover-card">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-[#121C2D] rounded-l-2xl"></div>
              <h3 className="text-xl font-bold mb-10 text-[#121C2D] flex items-center gap-3">
                <div className="bg-slate-100 p-2 rounded"><PackageOpen size={20} className="text-[#121C2D]"/></div>
                Pour les Chargeurs (Expéditeurs)
              </h3>
              <div className="space-y-8">
                <div className="flex gap-5">
                  <div className="w-8 h-8 rounded-full bg-[#121C2D] text-white flex items-center justify-center font-bold flex-shrink-0 text-sm">1</div>
                  <div>
                    <h4 className="font-bold text-[#121C2D]">Publiez votre demande</h4>
                    <p className="text-slate-500 mt-1 text-sm leading-relaxed">Indiquez la marchandise, le trajet et votre budget. Notre algorithme notifie les transporteurs pertinents.</p>
                  </div>
                </div>
                <div className="flex gap-5">
                  <div className="w-8 h-8 rounded-full bg-[#121C2D] text-white flex items-center justify-center font-bold flex-shrink-0 text-sm">2</div>
                  <div>
                    <h4 className="font-bold text-[#121C2D]">Recevez des offres</h4>
                    <p className="text-slate-500 mt-1 text-sm leading-relaxed">Les transporteurs vous répondent en temps réel. Comparez les prix et les profils de transporteurs.</p>
                  </div>
                </div>
                <div className="flex gap-5">
                  <div className="w-8 h-8 rounded-full bg-[#121C2D] text-white flex items-center justify-center font-bold flex-shrink-0 text-sm">3</div>
                  <div>
                    <h4 className="font-bold text-[#121C2D]">Confirmez & Suivez</h4>
                    <p className="text-slate-500 mt-1 text-sm leading-relaxed">Acceptez l'offre idéale, payez en sécurité et suivez votre marchandise jusqu'à l'arrivée.</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Transporteur */}
            <div className="bg-white rounded-2xl p-10 border border-gray-100 shadow-sm relative hover-card">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-[#FF6A3D] rounded-l-2xl"></div>
              <h3 className="text-xl font-bold mb-10 text-[#121C2D] flex items-center gap-3">
                <div className="bg-orange-50 p-2 rounded"><Truck size={20} className="text-[#FF6A3D]"/></div>
                Pour les Transporteurs
              </h3>
              <div className="space-y-8">
                <div className="flex gap-5">
                  <div className="w-8 h-8 rounded-full bg-[#FF6A3D] text-white flex items-center justify-center font-bold flex-shrink-0 text-sm">1</div>
                  <div>
                    <h4 className="font-bold text-[#121C2D]">Trouvez du fret de retour</h4>
                    <p className="text-slate-500 mt-1 text-sm leading-relaxed">Consultez les demandes en temps réel sur vos corridors réguliers pour éviter les retours à vide.</p>
                  </div>
                </div>
                <div className="flex gap-5">
                  <div className="w-8 h-8 rounded-full bg-[#FF6A3D] text-white flex items-center justify-center font-bold flex-shrink-0 text-sm">2</div>
                  <div>
                    <h4 className="font-bold text-[#121C2D]">Faites une offre</h4>
                    <p className="text-slate-500 mt-1 text-sm leading-relaxed">Acceptez le prix proposé par le chargeur ou proposez votre propre tarif concurrentiel.</p>
                  </div>
                </div>
                <div className="flex gap-5">
                  <div className="w-8 h-8 rounded-full bg-[#FF6A3D] text-white flex items-center justify-center font-bold flex-shrink-0 text-sm">3</div>
                  <div>
                    <h4 className="font-bold text-[#121C2D]">Paiement Garanti</h4>
                    <p className="text-slate-500 mt-1 text-sm leading-relaxed">Fonds sécurisés par Translink-Africa. Paiement garanti dès la livraison validée par le client final.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* POURQUOI CHOISIR */}
      <section className="py-24 px-6 md:px-10 bg-white reveal-on-scroll">
        <div className="max-w-7xl mx-auto">
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 stagger-children">
            <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] hover-card">
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-[#FF6A3D] mb-6">
                <FileText size={24} />
              </div>
              <h4 className="text-lg font-bold text-[#121C2D] mb-3">Vérification des documents</h4>
              <p className="text-slate-500 text-sm leading-relaxed">Tous les transporteurs passent par un rigoureux processus de validation de leurs assurances, permis et immatriculations.</p>
            </div>
            
            <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] hover-card">
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-[#FF6A3D] mb-6">
                <ArrowLeftRight size={24} />
              </div>
              <h4 className="text-lg font-bold text-[#121C2D] mb-3">Chargement retour</h4>
              <p className="text-slate-500 text-sm leading-relaxed">Évitez les trajets à vide. Notre algorithme suggère des opportunités de chargement pour vos trajets retour.</p>
            </div>
            
            <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] hover-card">
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-[#FF6A3D] mb-6">
                <MapPin size={24} />
              </div>
              <h4 className="text-lg font-bold text-[#121C2D] mb-3">Suivi en temps réel</h4>
              <p className="text-slate-500 text-sm leading-relaxed">Sachez exactement où se trouve votre cargaison grâce à notre système de géolocalisation partagé par SMS et WhatsApp.</p>
            </div>
            
            <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.1)] hover-card">
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center text-[#FF6A3D] mb-6">
                <Smartphone size={24} />
              </div>
              <h4 className="text-lg font-bold text-[#121C2D] mb-3">WhatsApp intégré</h4>
              <p className="text-slate-500 text-sm leading-relaxed">Restez connecté. Recevez des alertes et gérez vos échanges directement depuis l'application de messagerie la plus populaire.</p>
            </div>
          </div>
        </div>
      </section>

      {/* NOS CORRIDORS */}
      <section id="corridors" className="py-24 px-6 md:px-10 bg-[#FAFAFA] reveal-on-scroll">
         <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-16 items-center">
            <div className="flex-1 w-full">
              <p className="text-[#FF6A3D] font-bold text-xs uppercase tracking-widest mb-3">RÉSEAU ROUTIER</p>
              <h2 className="text-3xl font-bold text-[#121C2D] mb-4">Corridors stratégiques & trajets réguliers</h2>
              <p className="text-slate-500 mb-8">Une présence forte sur les axes de transport vitaux de l'Afrique de l'Ouest.</p>
              
              <div className="space-y-3">
                 {[
                   { route: 'Dakar ↔ Bamako', desc: '1,250 km (48h)', badge: 'Corridor Actif', active: true },
                   { route: 'Dakar ↔ Ziguinchor', desc: '450 km (12h)', badge: 'Ferry & Route', active: false },
                   { route: 'Dakar ↔ Kaolack', desc: '190 km (4h)', badge: 'Fluide', active: false },
                   { route: 'Dakar ↔ Saint-Louis', desc: '260 km (5h)', badge: 'Fluide', active: false },
                 ].map((c, i) => (
                    <div key={i} className={`flex items-center justify-between p-4 rounded-xl border ${c.active ? 'bg-white border-[#FF6A3D] shadow-sm' : 'bg-transparent border-gray-200'}`}>
                       <span className={`font-bold ${c.active ? 'text-[#121C2D]' : 'text-[#121C2D]'}`}>{c.route}</span>
                       <div className="flex items-center gap-4">
                         <span className="text-xs text-slate-400">{c.desc}</span>
                         <span className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-100 text-emerald-700">{c.badge}</span>
                       </div>
                    </div>
                 ))}
              </div>
            </div>
            <div className="flex-1 w-full">
               <img src="/images/map_dakar_bamako.png" alt="Carte des corridors" className="w-full h-auto rounded-2xl shadow-xl" />
            </div>
         </div>
      </section>

      {/* CE QUE NOUS FAISONS */}
      <section className="py-24 px-6 md:px-10 bg-[#121C2D] text-white reveal-on-scroll">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-[#FF6A3D] font-bold text-xs uppercase tracking-widest mb-3">CE QUE NOUS FAISONS</p>
          <h2 className="text-3xl font-bold mb-12">Quelles marchandises transportez-vous ?</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
             {[
               { icon: Anchor, label: 'Ciment & BTP' },
               { icon: Droplet, label: 'Prod. Agricoles' },
               { icon: Box, label: 'Biens Manufacturés' },
               { icon: Coins, label: 'Minerais & MP' },
               { icon: PackageOpen, label: 'Marchandises Diverses' }
             ].map((item, i) => (
                <div key={i} className="bg-white/5 border border-white/10 hover:bg-white/10 transition rounded-xl p-6 flex flex-col items-center gap-4 cursor-pointer">
                   <div className="bg-[#FF6A3D] p-3 rounded-full text-white">
                     <item.icon size={24} />
                   </div>
                   <span className="font-bold text-sm">{item.label}</span>
                </div>
             ))}
          </div>
        </div>
      </section>

      {/* TEMOIGNAGES */}
      <section className="py-24 px-6 md:px-10 bg-[#FAFAFA] reveal-on-scroll">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
             <p className="text-[#FF6A3D] font-bold text-xs uppercase tracking-widest mb-3">TÉMOIGNAGES</p>
             <h2 className="text-3xl font-bold text-[#121C2D]">Ceux qui nous font confiance sur le corridor</h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
             <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm relative">
                <Quote size={40} className="text-orange-50 absolute top-8 right-8" />
                <div className="flex gap-1 mb-4 text-[#FF6A3D]">
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                </div>
                <p className="text-slate-600 leading-relaxed italic mb-8">
                  "Grâce à Translink-Africa, j'ai pu optimiser mes retours de Bamako vers Dakar. Je ne roule plus à vide et mes camions sont rentabilisés à 100%. Le paiement via Wave est instantané dès la livraison."
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <User size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-[#121C2D]">Mamadou Faye</h4>
                    <p className="text-xs text-slate-500">Transporteur, Dakar</p>
                  </div>
                </div>
             </div>
             
             <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm relative">
                <Quote size={40} className="text-orange-50 absolute top-8 right-8" />
                <div className="flex gap-1 mb-4 text-[#FF6A3D]">
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                  <Star size={16} fill="currentColor" />
                </div>
                <p className="text-slate-600 leading-relaxed italic mb-8">
                  "J'expédie régulièrement du ciment. Trouver un camion en quelques minutes au lieu de passer la journée au téléphone a changé ma vie. La plateforme est très facile à utiliser."
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <User size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-[#121C2D]">Cheikh Diop</h4>
                    <p className="text-xs text-slate-500">Chargeur, Thiès</p>
                  </div>
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* OFFRES ADAPTEES */}
      <section id="tarifs" className="py-24 px-6 md:px-10 bg-white reveal-on-scroll">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
             <p className="text-[#FF6A3D] font-bold text-xs uppercase tracking-widest mb-3">ESSAI ET ABONNEMENT</p>
             <h2 className="text-3xl font-bold text-[#121C2D]">Une formule adaptée à chaque activité</h2>
             <p className="text-slate-500 mt-4 max-w-3xl mx-auto">Les comptes transport validés bénéficient de 14 jours d’essai complet. Après l’essai, l’offre gratuite conserve un camion opérationnel. Les abonnements sont mensuels et renouvelés manuellement, sans prélèvement automatique.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
             {[
               { name: 'Chauffeur indépendant', price: '5 000', role: 'CHAUFFEUR', details: ['1 camion', '1 chauffeur', 'Publier et accepter des offres'] },
               { name: 'Transporteur', price: '10 000', role: 'TRANSPORTEUR', details: ['Jusqu’à 3 camions', 'Jusqu’à 3 chauffeurs', 'Gestion d’équipe'] },
               { name: 'Entreprise / chargeur professionnel', price: '15 000', role: 'ENTREPRISE', details: ['Camions illimités', 'Chauffeurs illimités', 'Visibilité prioritaire des disponibilités'] },
               { name: 'Chargeur particulier / expéditeur', price: '2 500', role: 'CHARGEUR', details: ['Publier des demandes de transport', 'Abonnement actif requis', 'Renouvellement manuel chaque mois'] },
             ].map((plan, index) => (
               <article key={plan.name} className={`flex flex-col rounded-2xl bg-white p-6 ${index === 2 ? 'border-2 border-[#FF6A3D] shadow-lg' : 'border border-gray-200 shadow-sm'}`}>
                 <h3 className="text-lg font-bold text-[#121C2D]">{plan.name}</h3>
                 <p className="mt-3 text-3xl font-bold text-[#FF6A3D]">{plan.price} FCFA <span className="text-sm font-medium text-slate-500">/ mois</span></p>
                 <ul className="mt-5 flex-1 space-y-3 text-sm leading-6 text-slate-600">
                   {plan.details.map((feature) => <li key={feature} className="flex items-start gap-2"><Check size={16} className="mt-1 shrink-0 text-green-600" />{feature}</li>)}
                 </ul>
                 <Link to={`/register?role=${plan.role}`} className={`mt-7 block rounded-lg py-3 text-center text-sm font-bold transition ${index === 2 ? 'bg-[#FF6A3D] text-white hover:bg-[#e85b2d]' : 'border border-[#121C2D] text-[#121C2D] hover:bg-[#121C2D] hover:text-white'}`}>{plan.role === 'CHARGEUR' ? 'Créer un compte chargeur' : 'Commencer'}</Link>
               </article>
             ))}
          </div>
          <p className="mx-auto mt-6 max-w-4xl text-center text-xs leading-5 text-slate-500">Les commissions appliquées aux courses restent distinctes des abonnements. Les paiements d’abonnement sont proposés selon la configuration de la plateforme : KKiaPay ou paiement manuel lorsqu’il est activé.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6 md:px-10 bg-[#FAFAFA] reveal-on-scroll">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
             <p className="text-[#FF6A3D] font-bold text-xs uppercase tracking-widest mb-3">FAQ</p>
             <h2 className="text-3xl font-bold text-[#121C2D]">Questions Fréquentes</h2>
          </div>
          
          <div className="space-y-4">
             {[
                { q: "Comment les transporteurs sont-ils vérifiés ?", a: "Chaque transporteur doit fournir sa carte grise, son permis de conduire et son assurance en cours de validité. Nos équipes vérifient manuellement chaque document avant de valider le compte." },
                { q: "Quels sont les forfaits et leurs limites ?", a: "Individuel privé : 5 000 FCFA/mois pour 1 camion et 1 chauffeur. Petite entreprise : 10 000 FCFA/mois pour jusqu’à 3 camions et 3 chauffeurs. Grande entreprise : 15 000 FCFA/mois pour une flotte et des chauffeurs illimités, avec visibilité prioritaire des disponibilités." },
                { q: "Comment fonctionne l’abonnement chargeur ?", a: "Le chargeur souscrit à 2 500 FCFA par mois. Un abonnement actif est nécessaire pour publier ou renouveler une demande de transport. Le renouvellement est manuel, sans prélèvement automatique." },
                { q: "Quels sont les modes de paiement pris en charge ?", a: "Le paiement KKiaPay permet d’utiliser les moyens activés pour votre pays (mobile money, carte ou wallet). Wave, Orange Money et virement bancaire peuvent aussi être proposés s’ils sont activés par l’administration. Les paiements KKiaPay sont vérifiés automatiquement; les paiements manuels nécessitent une vérification de leur référence." },
                { q: "Quand commence l’essai gratuit et que se passe-t-il après ?", a: "L’essai complet de 14 jours est réservé aux comptes transport et commence après la validation du compte par l’administration. Ensuite, l’offre gratuite conserve un camion opérationnel. Choisissez la formule individuelle, petite ou grande entreprise pour gérer la flotte et l’équipe correspondant à vos besoins. Aucun prélèvement automatique n’est effectué." },
                { q: "Que se passe-t-il en cas de litige ?", a: "Les fonds sont bloqués sur notre plateforme jusqu'à la confirmation de livraison. En cas de désaccord, notre service client intervient comme médiateur." },
                { q: "Le suivi par GPS est-il obligatoire pour les transporteurs ?", a: "Il est fortement recommandé. Les transporteurs utilisant le suivi gagnent 3x plus d'offres de la part des chargeurs sur notre plateforme." }
             ].map((faq, i) => (
                 <div key={i} className={`bg-white border border-gray-200 rounded-xl p-6 faq-item ${openFaq === i ? 'faq-item-open' : ''}`}>
                   <button type="button" className="w-full text-left font-bold text-[#121C2D] flex items-center justify-between cursor-pointer" onClick={() => setOpenFaq(openFaq === i ? -1 : i)} aria-expanded={openFaq === i}>
                      {faq.q}
                     <ChevronRight size={18} className="faq-chevron text-slate-400" />
                   </button>
                   <div className="faq-answer"><p className="text-slate-500 text-sm mt-3 leading-relaxed">{faq.a}</p></div>
                </div>
             ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#121C2D] pt-16 pb-8 px-10 text-slate-400">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-16 border-b border-slate-800 pb-12">
           <div>
              <div className="flex items-center gap-2 mb-6">
                 <div className="bg-[#FF6A3D] p-1.5 rounded text-white">
                    <Truck size={24} />
                 </div>
                 <span className="text-xl font-bold text-white tracking-tight leading-none block">TRANSLINK-AFRICA</span>
              </div>
              <p className="text-sm leading-relaxed mb-6">Connecter les expéditeurs et les transporteurs avec la technologie la plus avancée pour le fret en Afrique de l'Ouest.</p>
           </div>
           
           <div>
              <h4 className="text-white font-bold mb-6">Services</h4>
              <ul className="space-y-3 text-sm">
                 <li><Link to="/register?role=CHARGEUR" className="hover:text-white transition">Pour les expéditeurs</Link></li>
                 <li><Link to="/register?role=TRANSPORTEUR" className="hover:text-white transition">Pour les transporteurs</Link></li>
                 <li><a href="#corridors" className="hover:text-white transition">Corridors</a></li>
                 <li><a href="#tarifs" className="hover:text-white transition">Tarifs et essai</a></li>
              </ul>
           </div>
           
           <div>
              <h4 className="text-white font-bold mb-6">Support</h4>
              <ul className="space-y-3 text-sm">
                 <li><a href="#faq" className="hover:text-white transition">Centre d’aide</a></li>
                 <li><a href="mailto:contact@translink-logistics.sn" className="hover:text-white transition">Contact par e-mail</a></li>
                 <li><Link to="/register?legal=confidentialite" className="hover:text-white transition">Confidentialité</Link></li>
                 <li><Link to="/register?legal=cgu" className="hover:text-white transition">Conditions d’utilisation</Link></li>
              </ul>
           </div>
           
           <div>
              <h4 className="text-white font-bold mb-6">Nous contacter</h4>
              <ul className="space-y-3 text-sm">
                 <li><a href="mailto:contact@translink-logistics.sn" className="hover:text-white transition">contact@translink-logistics.sn</a></li>
              </ul>
           </div>
        </div>
        
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center text-sm">
           <p>&copy; {new Date().getFullYear()} Translink-Africa Logistique. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
