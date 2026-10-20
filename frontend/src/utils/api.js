import axios from 'axios';
import { API_BASE_URL } from './apiBaseUrl';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add a request interceptor to attach the JWT token
api.interceptors.request.use(
  (config) => {
    let token = null;
    try {
      token = localStorage.getItem('token');
    } catch {
      // Send the request without persisted credentials when storage is unavailable.
    }
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle token expiration
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const requestUrl = error.config?.url || '';
    const isLoginRequest = requestUrl.includes('/api/auth/login');
    const isRegistrationDocumentRequest = ['/api/documents/upload', '/api/documents/submitted']
      .some((path) => requestUrl.endsWith(path));
    const isIntegrationAdminRequest = requestUrl.includes('/api/auth/admin/integrations');
    const isChauffeurInviteRequest = requestUrl.includes('/api/auth/invite-chauffeur');
    const isPayPalPaymentRequest = requestUrl.includes('/api/paiements/') && requestUrl.includes('/paypal/');
    const isSubscriptionPaymentRequest = requestUrl.includes('/api/paiements/abonnements');
    const isAdminProviderFundsRequest = requestUrl.includes('/api/paiements/admin/fonds');
    const isAdminSystemRequest = requestUrl.includes('/api/admin/system/');
    const isAlreadyOnErrorPage = window.location.pathname.startsWith('/erreur/');
    const shouldHandleIntegrationErrorInPage = isIntegrationAdminRequest
      && ([403, 502, 503, 504].includes(error.response?.status) || !error.response);
    const shouldHandleAdminProviderFundsErrorInPage = isAdminProviderFundsRequest
      && ([502, 503, 504].includes(error.response?.status) || !error.response);
    const shouldHandleChauffeurInviteErrorInPage = isChauffeurInviteRequest && error.response?.status === 503;
    const shouldHandlePayPalErrorInPage = isPayPalPaymentRequest && [502, 503, 504].includes(error.response?.status);
    const shouldHandleSubscriptionPaymentErrorInPage = isSubscriptionPaymentRequest && [400, 404, 409, 500, 503].includes(error.response?.status);
    const shouldHandleAdminSystemErrorInPage = isAdminSystemRequest && [400, 503].includes(error.response?.status);

    if (!isLoginRequest && !isRegistrationDocumentRequest && !isAlreadyOnErrorPage && !shouldHandleIntegrationErrorInPage && !shouldHandleAdminProviderFundsErrorInPage && !shouldHandleChauffeurInviteErrorInPage && !shouldHandlePayPalErrorInPage && !shouldHandleAdminSystemErrorInPage && !shouldHandleSubscriptionPaymentErrorInPage) {
      const status = error.response?.status;
      const errorType = status === 401
        ? 'session-expired'
        : status === 403
          ? 'access-denied'
          : status === 404
            ? 'not-found'
          : status === 502 || status === 503 || status === 504 || !error.response
            ? 'service-unavailable'
            : status >= 500
              ? 'server-error'
              : null;

      if (errorType) {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (status === 401) {
          try {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          } catch {
            // The redirect still handles an expired session when storage is unavailable.
          }
        }
        const query = new URLSearchParams({ returnTo }).toString();
        window.location.replace(`/erreur/${errorType}?${query}`);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
