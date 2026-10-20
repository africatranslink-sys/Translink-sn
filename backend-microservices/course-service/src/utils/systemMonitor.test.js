const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getMonitoredService, calculateCpuPercent } = require('./systemMonitor');

test('journal access is limited to the four Translink systemd units', () => {
  assert.equal(getMonitoredService().length, 4);
  assert.equal(getMonitoredService('auth').unit, 'translink-auth-service.service');
  assert.equal(getMonitoredService('unknown'), null);
});

test('calculates host CPU activity from successive samples', () => {
  assert.equal(calculateCpuPercent({ idle: 100, total: 200 }, { idle: 150, total: 300 }), 50);
  assert.equal(calculateCpuPercent({ idle: 100, total: 200 }, { idle: 100, total: 200 }), null);
});
