const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const { performance } = require('node:perf_hooks');
const { promisify } = require('node:util');
const db = require('../config/db');
const { getMonitoredService, calculateCpuPercent } = require('../utils/systemMonitor');

const execFileAsync = promisify(execFile);
let previousCpuSnapshot = null;

const captureCpuSnapshot = () => os.cpus().reduce((snapshot, cpu) => {
  const times = Object.values(cpu.times);
  snapshot.total += times.reduce((total, time) => total + time, 0);
  snapshot.idle += cpu.times.idle;
  return snapshot;
}, { idle: 0, total: 0 });

const probeService = async (service) => {
  try {
    const response = await fetch(`http://127.0.0.1:${service.port}/`, {
      signal: AbortSignal.timeout(1500)
    });
    await response.body?.cancel();
    return { key: service.key, label: service.label, status: response.ok ? 'running' : 'unhealthy', http_status: response.status };
  } catch {
    return { key: service.key, label: service.label, status: 'unavailable' };
  }
};

const getSystemOverview = async (req, res) => {
  const cpuSnapshot = captureCpuSnapshot();
  const cpuPercent = previousCpuSnapshot ? calculateCpuPercent(previousCpuSnapshot, cpuSnapshot) : null;
  previousCpuSnapshot = cpuSnapshot;

  const cpu = os.cpus();
  const memoryTotal = os.totalmem();
  const memoryFree = os.freemem();
  const [databaseResult, diskResult, services] = await Promise.all([
    (async () => {
      const start = performance.now();
      try {
        const { rows } = await db.query(
          `SELECT current_database() AS name,
                  pg_database_size(current_database())::text AS size_bytes,
                  (SELECT COUNT(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS active_connections,
                  current_setting('server_version') AS version;`
        );
        return {
          status: 'available',
          latency_ms: Math.round(performance.now() - start),
          ...rows[0],
          size_bytes: Number(rows[0].size_bytes),
          pool: {
            total: db.pool.totalCount,
            idle: db.pool.idleCount,
            waiting: db.pool.waitingCount
          }
        };
      } catch (error) {
        console.error('Admin server monitor database probe failed:', error.message);
        return { status: 'unavailable', error: 'Connexion à PostgreSQL impossible.' };
      }
    })(),
    fs.statfs('/').then((stats) => ({
      status: 'available',
      total_bytes: stats.blocks * stats.bsize,
      free_bytes: stats.bavail * stats.bsize
    })).catch((error) => {
      console.error('Admin server monitor disk probe failed:', error.message);
      return { status: 'unavailable', error: 'Informations disque indisponibles.' };
    }),
    Promise.all(getMonitoredService().map(probeService))
  ]);

  const memoryUsed = memoryTotal - memoryFree;
  res.json({
    status: databaseResult.status === 'available' && services.every((service) => service.status === 'running')
      ? 'healthy'
      : 'degraded',
    captured_at: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      uptime_seconds: Math.floor(os.uptime()),
      load_average: os.loadavg(),
      cpu: {
        model: cpu[0]?.model || 'Unknown',
        cores: cpu.length,
        usage_percent: cpuPercent
      },
      memory: {
        total_bytes: memoryTotal,
        used_bytes: memoryUsed,
        free_bytes: memoryFree,
        usage_percent: Math.round((memoryUsed / memoryTotal) * 100)
      },
      process: {
        uptime_seconds: Math.floor(process.uptime()),
        memory_rss_bytes: process.memoryUsage().rss
      },
      disk: diskResult
    },
    database: databaseResult,
    services
  });
};

const getSystemLogs = async (req, res) => {
  const service = getMonitoredService(req.query.service);
  if (!service) {
    return res.status(400).json({ error: 'Service de journaux non reconnu.' });
  }
  if (process.platform !== 'linux') {
    return res.status(503).json({ error: 'La consultation des journaux systemd est disponible uniquement sur le VPS Linux.' });
  }

  try {
    const { stdout } = await execFileAsync('/usr/bin/sudo', [
      '-n',
      '/usr/bin/journalctl',
      `--unit=${service.unit}`,
      '--no-pager',
      '--output=short-iso',
      '--lines=100'
    ], {
      timeout: 8000,
      maxBuffer: 256 * 1024,
      encoding: 'utf8'
    });
    const sanitizedLogs = stdout
      .replace(/((?:password|secret|token|authorization|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi, '$1[masqué]')
      .slice(0, 100_000);
    res.json({ service: service.key, unit: service.unit, lines: 100, logs: sanitizedLogs });
  } catch (error) {
    console.error(`Admin journal access failed for ${service.unit}:`, error.message);
    res.status(503).json({
      error: 'Les journaux de ce service ne sont pas accessibles. Vérifiez la configuration sudoers du VPS.'
    });
  }
};

module.exports = { getSystemOverview, getSystemLogs };
