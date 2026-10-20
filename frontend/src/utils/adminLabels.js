export function formatActorRole(role, language) {
  const labels = {
    CHARGEUR: { fr: 'Chargeur', en: 'Shipper' },
    CHAUFFEUR: { fr: 'Chauffeur', en: 'Driver' },
    TRANSPORTEUR: { fr: 'Transporteur', en: 'Carrier' },
    ENTREPRISE: { fr: 'Entreprise', en: 'Company' },
    ADMIN: { fr: 'Administrateur', en: 'Administrator' },
  };
  return labels[role]?.[language] || role;
}

export function formatVerificationStatus(status, language) {
  const labels = {
    EN_ATTENTE: { fr: 'En attente', en: 'Pending' },
    VALIDE: { fr: 'Validé', en: 'Approved' },
    REFUSE: { fr: 'Refusé', en: 'Rejected' },
    SUSPENDU: { fr: 'Suspendu', en: 'Suspended' },
  };
  return labels[status]?.[language] || status;
}
