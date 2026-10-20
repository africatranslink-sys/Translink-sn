import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import RegisterPage from './pages/RegisterPage';
import InvitationPage from './pages/InvitationPage';
import LoginPage from './pages/LoginPage';
import LoginLoadingPage from './pages/LoginLoadingPage';
import DashboardChargeur from './pages/DashboardChargeurStats';
import DashboardTransporteur from './pages/DashboardTransporteurStats';
import DashboardChauffeur from './pages/DashboardChauffeurStats';
import CreateDemandePage from './pages/CreateDemandePage';
import ProfilePage from './pages/ProfilePage';
import ChargeurToolPage from './pages/ChargeurToolPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsersPage from './pages/AdminUsersModernPage';
import AdminSignalementsPage from './pages/AdminSignalementsPage';
import AdminAnnouncementsPage from './pages/AdminAnnouncementsPage';
import AdminIntegrationsPage from './pages/AdminIntegrationsPage';
import AdminTransactionsPage from './pages/AdminTransactionsPage';
import AdminNewsletterPage from './pages/AdminNewsletterPage';
import AdminSystemPage from './pages/AdminSystemPage';
import SubscriptionPage from './pages/SubscriptionPage';
import NewsletterUnsubscribePage from './pages/NewsletterUnsubscribePage';
import TransactionHistoryPage from './pages/TransactionHistoryPage';
import TrackingPage from './pages/TrackingPage';
import TransporteurToolPage from './pages/TransporteurToolPage';
import ChauffeurToolPage from './pages/ChauffeurToolPage';
import TransporteurCamionForm from './pages/TransporteurCamionForm';
import TransporteurDisponibiliteForm from './pages/TransporteurDisponibiliteForm';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorPage from './pages/ErrorPage';
import LanguageSwitcher from './components/LanguageSwitcher';

function App() {
  return (
    <div className="min-h-screen">
      <LanguageSwitcher />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/invitation" element={<InvitationPage />} />
        <Route path="/newsletter/unsubscribe" element={<NewsletterUnsubscribePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/loading" element={<LoginLoadingPage />} />
        <Route path="/erreur/:type" element={<ErrorPage />} />
        
        <Route path="/chargeur" element={
          <ProtectedRoute allowedRoles={['CHARGEUR']}>
            <DashboardChargeur />
          </ProtectedRoute>
        } />
        
        <Route path="/chargeur/demande" element={
          <ProtectedRoute allowedRoles={['CHARGEUR']}>
            <CreateDemandePage />
          </ProtectedRoute>
        } />

        <Route path="/chargeur/demandes" element={<ProtectedRoute allowedRoles={['CHARGEUR']}><ChargeurToolPage mode="demandes" /></ProtectedRoute>} />
        <Route path="/chargeur/recherche" element={<ProtectedRoute allowedRoles={['CHARGEUR']}><ChargeurToolPage mode="recherche" /></ProtectedRoute>} />
        <Route path="/chargeur/historique" element={<ProtectedRoute allowedRoles={['CHARGEUR']}><ChargeurToolPage mode="historique" /></ProtectedRoute>} />
        <Route path="/chargeur/documents" element={<ProtectedRoute allowedRoles={['CHARGEUR']}><ChargeurToolPage mode="documents" /></ProtectedRoute>} />
        <Route path="/chargeur/suivi" element={<ProtectedRoute allowedRoles={['CHARGEUR']}><TrackingPage actor="chargeur" /></ProtectedRoute>} />

        <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/utilisateurs" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminUsersPage /></ProtectedRoute>} />
        <Route path="/admin/documents" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboard section="documents" /></ProtectedRoute>} />
        <Route path="/admin/annonces" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminAnnouncementsPage /></ProtectedRoute>} />
        <Route path="/admin/newsletter" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminNewsletterPage /></ProtectedRoute>} />
        <Route path="/admin/signalements" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminSignalementsPage /></ProtectedRoute>} />
        <Route path="/admin/services" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminIntegrationsPage /></ProtectedRoute>} />
        <Route path="/admin/transactions" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminTransactionsPage /></ProtectedRoute>} />
        <Route path="/admin/serveur" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminSystemPage /></ProtectedRoute>} />
        <Route path="/abonnement" element={<ProtectedRoute allowedRoles={['CHAUFFEUR', 'ENTREPRISE', 'TRANSPORTEUR', 'CHARGEUR']}><SubscriptionPage /></ProtectedRoute>} />
        <Route path="/transactions" element={<ProtectedRoute><TransactionHistoryPage /></ProtectedRoute>} />
        <Route path="/admin/suivi" element={<ProtectedRoute allowedRoles={['ADMIN']}><TrackingPage actor="admin" /></ProtectedRoute>} />
        
        <Route path="/transporteur" element={
          <ProtectedRoute allowedRoles={['TRANSPORTEUR', 'ENTREPRISE']}>
            <DashboardTransporteur />
          </ProtectedRoute>
        } />
        
        <Route path="/chauffeur" element={
          <ProtectedRoute allowedRoles={['CHAUFFEUR']}>
            <DashboardChauffeur />
          </ProtectedRoute>
        } />
        <Route path="/chauffeur/missions" element={<ProtectedRoute allowedRoles={['CHAUFFEUR']}><ChauffeurToolPage mode="missions" /></ProtectedRoute>} />
        <Route path="/chauffeur/historique" element={<ProtectedRoute allowedRoles={['CHAUFFEUR']}><ChauffeurToolPage mode="historique" /></ProtectedRoute>} />
        <Route path="/chauffeur/camions" element={<ProtectedRoute allowedRoles={['CHAUFFEUR']}><TransporteurToolPage mode="camions" /></ProtectedRoute>} />
        <Route path="/chauffeur/camions/nouveau" element={<ProtectedRoute allowedRoles={['CHAUFFEUR']}><TransporteurCamionForm /></ProtectedRoute>} />
        <Route path="/chauffeur/disponibilite/nouveau" element={<ProtectedRoute allowedRoles={['CHAUFFEUR']}><TransporteurDisponibiliteForm /></ProtectedRoute>} />
        <Route path="/chauffeur/recherche" element={<ProtectedRoute allowedRoles={['CHAUFFEUR']}><TransporteurToolPage mode="recherche" /></ProtectedRoute>} />
        <Route path="/chauffeur/documents" element={<ProtectedRoute allowedRoles={['CHAUFFEUR']}><ChauffeurToolPage mode="documents" /></ProtectedRoute>} />
        <Route path="/chauffeur/suivi" element={<ProtectedRoute allowedRoles={['CHAUFFEUR']}><TrackingPage actor="chauffeur" /></ProtectedRoute>} />

        <Route path="/transporteur/camions" element={<ProtectedRoute allowedRoles={['TRANSPORTEUR', 'ENTREPRISE']}><TransporteurToolPage mode="camions" /></ProtectedRoute>} />
        <Route path="/transporteur/chauffeurs" element={<ProtectedRoute allowedRoles={['TRANSPORTEUR', 'ENTREPRISE']}><TransporteurToolPage mode="chauffeurs" /></ProtectedRoute>} />
        <Route path="/transporteur/camions/nouveau" element={<ProtectedRoute allowedRoles={['TRANSPORTEUR', 'ENTREPRISE']}><TransporteurCamionForm /></ProtectedRoute>} />
        <Route path="/transporteur/disponibilite/nouveau" element={<ProtectedRoute allowedRoles={['TRANSPORTEUR', 'ENTREPRISE']}><TransporteurDisponibiliteForm /></ProtectedRoute>} />
        <Route path="/transporteur/recherche" element={<ProtectedRoute allowedRoles={['TRANSPORTEUR', 'ENTREPRISE']}><TransporteurToolPage mode="recherche" /></ProtectedRoute>} />
        <Route path="/transporteur/courses" element={<ProtectedRoute allowedRoles={['TRANSPORTEUR', 'ENTREPRISE']}><TransporteurToolPage mode="courses" /></ProtectedRoute>} />
        <Route path="/transporteur/historique" element={<ProtectedRoute allowedRoles={['TRANSPORTEUR', 'ENTREPRISE']}><TransporteurToolPage mode="historique" /></ProtectedRoute>} />
        <Route path="/transporteur/documents" element={<ProtectedRoute allowedRoles={['TRANSPORTEUR', 'ENTREPRISE']}><TransporteurToolPage mode="documents" /></ProtectedRoute>} />
        <Route path="/transporteur/suivi" element={<ProtectedRoute allowedRoles={['TRANSPORTEUR', 'ENTREPRISE']}><TrackingPage actor="transporteur" /></ProtectedRoute>} />

        <Route path="/profile" element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        } />
        <Route path="*" element={<ErrorPage type="not-found" />} />
      </Routes>
    </div>
  );
}

export default App;
