const DOCUMENT_TYPE_LABELS = {
  CARTE_GRISE_RECTO: { fr: 'Carte grise recto', en: 'Vehicle registration (front)' },
  CARTE_GRISE_VERSO: { fr: 'Carte grise verso', en: 'Vehicle registration (back)' },
  ASSURANCE: { fr: 'Assurance', en: 'Insurance' },
  PHOTO_CAMION: { fr: 'Photo du camion', en: 'Truck photo' },
  PERMIS_CONDUIRE: { fr: 'Permis de conduire', en: 'Driver’s license' },
};

export function formatDocumentType(type = '', language) {
  return DOCUMENT_TYPE_LABELS[type]?.[language] || type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Document';
}

export function formatDocumentStatus(status, language) {
  const labels = {
    VALIDE: { fr: 'Validé', en: 'Approved' },
    REFUSE: { fr: 'Refusé', en: 'Rejected' },
    EN_ATTENTE: { fr: 'En attente', en: 'Pending' },
  };
  return labels[status]?.[language] || status.replace(/_/g, ' ');
}
