const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { isSessionActive } = require('../../../shared/redis');
const NegotiationModel = require('../models/negotiationModel');

let io;
const negotiationRoom = (conversationId) => `negotiation:${conversationId}`;
const respond = (ack, payload) => {
  if (typeof ack === 'function') ack(payload);
};

function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentification requise.'));

      const user = jwt.verify(token, process.env.JWT_SECRET);
      if (user.sid && !await isSessionActive(user.sid, user.id)) {
        return next(new Error('Session invalide.'));
      }

      socket.data.user = user;
      return next();
    } catch (error) {
      return next(new Error('Authentification invalide.'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user.id;
    socket.join(`user:${userId}`);

    if (socket.data.user.role === 'ADMIN') {
      socket.on('joinTracking', () => socket.join('admin:tracking'));
      socket.on('leaveTracking', () => socket.leave('admin:tracking'));
    }

    socket.on('chat:join', async ({ conversationId } = {}, ack) => {
      const id = Number(conversationId);
      if (!Number.isSafeInteger(id) || id <= 0) return respond(ack, { error: 'Identifiant de conversation invalide.' });
      try {
        await NegotiationModel.findConversationForUser(id, userId);
        await socket.join(negotiationRoom(id));
        return respond(ack, { ok: true });
      } catch (error) {
        return respond(ack, { error: error.message || 'Accès à cette conversation refusé.' });
      }
    });

    socket.on('chat:leave', ({ conversationId } = {}) => {
      const id = Number(conversationId);
      if (Number.isSafeInteger(id) && id > 0) socket.leave(negotiationRoom(id));
    });

    socket.on('chat:send-message', async ({ conversationId, content } = {}, ack) => {
      const id = Number(conversationId);
      if (!Number.isSafeInteger(id) || id <= 0) return respond(ack, { error: 'Identifiant de conversation invalide.' });
      try {
        const message = await NegotiationModel.createMessage(id, userId, content);
        io.to(negotiationRoom(id)).emit('chat:new-message', message);
        return respond(ack, { message });
      } catch (error) {
        return respond(ack, { error: error.message || 'Impossible d’envoyer le message.' });
      }
    });

    socket.on('chat:send-proposal', async ({ conversationId, amount } = {}, ack) => {
      const id = Number(conversationId);
      if (!Number.isSafeInteger(id) || id <= 0) return respond(ack, { error: 'Identifiant de conversation invalide.' });
      try {
        const proposal = await NegotiationModel.createPriceProposal(id, userId, amount);
        io.to(negotiationRoom(id)).emit('chat:new-proposal', proposal);
        return respond(ack, { proposal });
      } catch (error) {
        return respond(ack, { error: error.message || 'Impossible d’envoyer la proposition de prix.' });
      }
    });
  });

  return io;
}

function emitPosition(position) {
  io?.to('admin:tracking').emit('positionBus', position);
}

function emitPositionRemoved(courseId) {
  io?.to('admin:tracking').emit('positionBusRemoved', { courseId: String(courseId) });
}

function emitCourseUpdated(course) {
  if (!io || !course) return;
  // Notify the chargeur/expediteur if exists
  if (course.expediteur_id) {
    io.to(`user:${course.expediteur_id}`).emit('courseUpdated', course);
  }
  // Notify the camion proprietaire (transporteur/entreprise)
  if (course.camion_proprietaire_id) {
    io.to(`user:${course.camion_proprietaire_id}`).emit('courseUpdated', course);
  }
  // Notify the chauffeur
  if (course.camion_chauffeur_id) {
    io.to(`user:${course.camion_chauffeur_id}`).emit('courseUpdated', course);
  }
}

function emitNegotiationUpdated(conversationId, event, payload) {
  io?.to(negotiationRoom(conversationId)).emit(event, payload);
}

function emitUserEvent(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

function emitDashboardChange(payload) {
  io?.emit('dashboard:data-changed', payload);
}

module.exports = { emitPosition, emitPositionRemoved, emitCourseUpdated, emitNegotiationUpdated, emitUserEvent, emitDashboardChange, initializeSocket };