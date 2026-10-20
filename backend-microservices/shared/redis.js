const { randomUUID } = require('crypto');
const { createClient } = require('redis');

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const POSITION_TTL_SECONDS = Number(process.env.REDIS_POSITION_TTL_SECONDS || 300);
const POSITION_INDEX_KEY = 'translink:tracking:active-courses';
const USER_SOCKET_EVENTS_CHANNEL = 'translink:socket:user-events';

const redisClient = createClient({
  url: process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`,
});

redisClient.on('error', (error) => console.error('Erreur Redis:', error.message));
redisClient.on('connect', () => console.log('Connecté à Redis avec succès.'));
redisClient.on('ready', () => console.log('Client Redis prêt.'));

async function connectRedis() {
  if (!redisClient.isOpen) {
    console.log('Tentative de connexion à Redis...');
    await redisClient.connect();
  }
}

async function createSession(userId) {
  const sessionId = randomUUID();
  await redisClient.set(`translink:session:${sessionId}`, String(userId), { EX: SESSION_TTL_SECONDS });
  return sessionId;
}

async function isSessionActive(sessionId, userId) {
  if (!sessionId) return false;
  const storedUserId = await redisClient.get(`translink:session:${sessionId}`);
  return storedUserId === String(userId);
}

async function publishUserSocketEvent(userId, event, payload) {
  if (!redisClient.isOpen) await connectRedis();
  await redisClient.publish(USER_SOCKET_EVENTS_CHANNEL, JSON.stringify({ userId, event, payload }));
}

async function publishDashboardChangeEvent(payload) {
  if (!redisClient.isOpen) await connectRedis();
  await redisClient.publish(
    USER_SOCKET_EVENTS_CHANNEL,
    JSON.stringify({ broadcast: true, event: 'dashboard:data-changed', payload })
  );
}

async function subscribeUserSocketEvents(handler) {
  const subscriber = redisClient.duplicate();
  subscriber.on('error', (error) => console.error('Erreur abonné Redis Socket.IO :', error.message));
  if (!subscriber.isOpen) await subscriber.connect();
  await subscriber.subscribe(USER_SOCKET_EVENTS_CHANNEL, (message) => {
    try {
      handler(JSON.parse(message));
    } catch (error) {
      console.error('Événement Socket.IO Redis invalide :', error.message);
    }
  });
  return async () => {
    await subscriber.unsubscribe(USER_SOCKET_EVENTS_CHANNEL);
    await subscriber.quit();
  };
}

async function cachePosition(position) {
  const courseId = String(position.courseId);
  const vehicleId = String(position.vehicleId);
  const expiresAt = Date.now() + POSITION_TTL_SECONDS * 1000;
  const geoKey = `translink:tracking:geo:${courseId}`;

  await Promise.all([
    redisClient.set(`translink:tracking:position:${courseId}`, JSON.stringify(position), { EX: POSITION_TTL_SECONDS }),
    redisClient.geoAdd(geoKey, {
      longitude: position.lng,
      latitude: position.lat,
      member: vehicleId,
    }),
    redisClient.expire(geoKey, POSITION_TTL_SECONDS),
    redisClient.zAdd(POSITION_INDEX_KEY, { score: expiresAt, value: courseId }),
  ]);
}

async function getActivePositions(courseIds) {
  const now = Date.now();
  await redisClient.zRemRangeByScore(POSITION_INDEX_KEY, '-inf', String(now));
  const indexedCourseIds = await redisClient.zRangeByScore(POSITION_INDEX_KEY, String(now + 1), '+inf');
  const allowedCourseIds = courseIds ? new Set(courseIds.map(String)) : null;
  const positions = await Promise.all(indexedCourseIds.map(async (courseId) => {
    if (allowedCourseIds && !allowedCourseIds.has(courseId)) return null;
    const value = await redisClient.get(`translink:tracking:position:${courseId}`);
    if (!value) {
      await redisClient.zRem(POSITION_INDEX_KEY, courseId);
      return null;
    }
    return JSON.parse(value);
  }));

  return positions.filter(Boolean);
}

async function removePosition(courseId) {
  const normalizedCourseId = String(courseId);
  await Promise.all([
    redisClient.del(`translink:tracking:position:${normalizedCourseId}`),
    redisClient.del(`translink:tracking:geo:${normalizedCourseId}`),
    redisClient.zRem(POSITION_INDEX_KEY, normalizedCourseId),
  ]);
}

module.exports = {
  cachePosition,
  connectRedis,
  createSession,
  getActivePositions,
  isSessionActive,
  removePosition,
  publishUserSocketEvent,
  publishDashboardChangeEvent,
  redisClient,
  subscribeUserSocketEvents,
};