const getAccountAccessError = (status) => {
  if (status === 'SUSPENDU') {
    return 'Votre compte a été suspendu. Vous ne pourrez plus accéder à votre espace tant que la suspension n’aura pas été levée.';
  }
  if (status === 'REFUSE') {
    return 'Votre compte a été refusé. Contactez l’administration de Translink-Africa pour plus d’informations.';
  }
  if (status !== 'VALIDE') {
    return 'Votre compte est en attente de validation. Vous pourrez accéder à votre espace dès que l’administration aura vérifié vos documents.';
  }
  return null;
};

module.exports = { getAccountAccessError };
