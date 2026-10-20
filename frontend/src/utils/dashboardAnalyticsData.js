const CHART_COLORS = ['#2F80ED', '#22A6A1', '#FF6A3D', '#C2413B', '#D5A02E', '#64748B'];

export const STATUS_LABELS = {
  PUBLIEE: 'Publiée',
  CAMION_TROUVE: 'Camion trouvé',
  CHARGEMENT: 'Chargement',
  LIVRAISON: 'En livraison',
  SOLDE_REGLE: 'Terminée',
  ANNULEE: 'Annulée',
  DISPONIBLE: 'Disponible',
  EN_MISSION: 'En mission',
  INDISPONIBLE: 'Indisponible',
};

const ENGLISH_STATUS_LABELS = {
  PUBLIEE: 'Published',
  CAMION_TROUVE: 'Truck found',
  CHARGEMENT: 'Loading',
  LIVRAISON: 'In delivery',
  SOLDE_REGLE: 'Completed',
  ANNULEE: 'Cancelled',
  DISPONIBLE: 'Available',
  EN_MISSION: 'On assignment',
  INDISPONIBLE: 'Unavailable',
};

export const ACTIVE_COURSE_STATUSES = new Set(['CAMION_TROUVE', 'CHARGEMENT', 'LIVRAISON']);

export function buildMonthlySeries(items, dateField = 'date_creation', language = 'fr') {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => new Date(now.getFullYear(), now.getMonth() - 5 + index, 1));

  return months.map((month) => {
    const monthNumber = month.getMonth();
    const year = month.getFullYear();
    const count = items.filter((item) => {
      const date = new Date(item[dateField]);
      return Number.isFinite(date.getTime()) && date.getFullYear() === year && date.getMonth() === monthNumber;
    }).length;

    return {
      label: month.toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { month: 'short' }).replace('.', ''),
      value: count,
    };
  });
}

export function buildMonthlyPayoutSeries(items, ownerId, language = 'fr') {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, index) => new Date(now.getFullYear(), now.getMonth() - 5 + index, 1));
  const totals = new Map(months.map((month) => [`${month.getFullYear()}-${month.getMonth()}`, 0]));

  items.forEach((item) => {
    if (String(item.proprietaire_id) !== String(ownerId)) return;

    [
      ['statut_reversement_avance', 'date_reversement_avance', 'montant_avance_net'],
      ['statut_reversement_solde', 'date_reversement_solde', 'montant_solde_net'],
    ].forEach(([statusField, dateField, amountField]) => {
      if (item[statusField] !== 'ENVOYE' || !item[dateField]) return;

      const date = new Date(item[dateField]);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const amount = Number(item[amountField]);
      if (Number.isFinite(date.getTime()) && totals.has(key) && Number.isFinite(amount)) {
        totals.set(key, totals.get(key) + amount);
      }
    });
  });

  return months.map((month) => ({
    label: month.toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', { month: 'short' }).replace('.', ''),
    value: totals.get(`${month.getFullYear()}-${month.getMonth()}`),
  }));
}

export function buildStatusDistribution(items, language = 'fr') {
  const counts = new Map();
  items.forEach((item) => {
    const status = item.statut || 'INCONNU';
    counts.set(status, (counts.get(status) || 0) + 1);
  });

  return [...counts.entries()].map(([status, value], index) => ({
    label: (language === 'en' ? ENGLISH_STATUS_LABELS : STATUS_LABELS)[status] || status,
    value,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
}

export function formatCount(value) {
  return Number(value || 0).toLocaleString('fr-FR');
}