const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

export const API_BASE_URL = configuredApiUrl || `${window.location.protocol}//${window.location.hostname}:5000`;