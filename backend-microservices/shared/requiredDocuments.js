const requiredDocumentsByRole = Object.freeze({
  CHARGEUR: ['CARTE_IDENTITE_RECTO', 'CARTE_IDENTITE_VERSO'],
  ENTREPRISE: ['CARTE_IDENTITE_RECTO', 'CARTE_IDENTITE_VERSO', 'NINEA', 'REGISTRE_COMMERCE'],
  TRANSPORTEUR: ['CARTE_IDENTITE_RECTO', 'CARTE_IDENTITE_VERSO', 'NINEA', 'REGISTRE_COMMERCE', 'LICENCE_TRANSPORT'],
  CHAUFFEUR: ['CARTE_IDENTITE_RECTO', 'CARTE_IDENTITE_VERSO', 'PERMIS'],
  ADMIN: [],
});

const getRequiredDocuments = (role) => requiredDocumentsByRole[role] || [];

const getMissingRequiredDocuments = (role, submittedTypes) => {
  const submitted = new Set(submittedTypes);
  return getRequiredDocuments(role).filter((documentType) => !submitted.has(documentType));
};

module.exports = { getRequiredDocuments, getMissingRequiredDocuments };
