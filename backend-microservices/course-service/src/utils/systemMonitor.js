const monitoredServices = Object.freeze([
  Object.freeze({ key: 'gateway', label: 'Passerelle API', unit: 'translink-api-gateway.service', port: 5000 }),
  Object.freeze({ key: 'auth', label: 'Authentification', unit: 'translink-auth-service.service', port: 5001 }),
  Object.freeze({ key: 'annonce', label: 'Annonces et camions', unit: 'translink-annonce-service.service', port: 5002 }),
  Object.freeze({ key: 'course', label: 'Courses et paiements', unit: 'translink-course-service.service', port: 5003 })
]);

const getMonitoredService = (key) => key == null
  ? monitoredServices
  : monitoredServices.find((service) => service.key === key) || null;

const calculateCpuPercent = (previous, current) => {
  const totalDelta = current.total - previous.total;
  const idleDelta = current.idle - previous.idle;
  if (totalDelta <= 0 || idleDelta < 0) return null;
  return Math.round(((totalDelta - idleDelta) / totalDelta) * 100);
};

module.exports = { getMonitoredService, calculateCpuPercent };
