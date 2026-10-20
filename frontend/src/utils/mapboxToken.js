import { API_BASE_URL } from './apiBaseUrl';

const environmentToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

export async function getMapboxToken() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/api/auth/public-config/mapbox`, { signal: controller.signal });
    if (!response.ok) throw new Error('Configuration Mapbox indisponible.');
    const config = await response.json();
    if (config?.token) return config.token;
  } catch {
    // Keep maps usable when the API is not yet configured.
  } finally {
    clearTimeout(timeoutId);
  }
  return environmentToken;
}