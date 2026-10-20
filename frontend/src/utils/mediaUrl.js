import { API_BASE_URL } from './apiBaseUrl';

export function resolveMediaUrl(source) {
  if (!source || !source.startsWith('/uploads/')) return source || '';
  return `${API_BASE_URL.replace(/\/$/, '')}${source}`;
}