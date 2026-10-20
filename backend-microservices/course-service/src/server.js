const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { initializeDatabase } = require('./scripts/initDb');
const { runSubscriptionReminderJob } = require('./services/subscriptionReminderService');
const { connectRedis, subscribeUserSocketEvents } = require('../../shared/redis');
const { emitUserEvent, emitDashboardChange, initializeSocket } = require('./sockets');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger Documentation
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./config/swagger.json');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Uploads directory static path (for locally hosted documents)
app.use('/uploads', express.static('uploads'));

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Translink-Africa API is running' });
});

// Import Routes
const courseRoutes = require('./routes/courseRoutes');
const paiementRoutes = require('./routes/paiementRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const negotiationRoutes = require('./routes/negotiationRoutes');

// Mount Routes
app.use('/api/courses', courseRoutes);
app.use('/api/paiements', paiementRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chats', negotiationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Une erreur interne du serveur est survenue' });
});

const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
initializeSocket(httpServer);

(async () => {
  try {
    await connectRedis();
  } catch (error) {
    console.error('Connexion Redis impossible au démarrage :', error.message);
    process.exit(1);
  }

  try {
    await subscribeUserSocketEvents(({ userId, event, payload }) => {
      if (event === 'dashboard:data-changed') {
        emitDashboardChange(payload);
      } else if (userId && event) {
        emitUserEvent(userId, event, payload);
      }
    });
  } catch (error) {
    console.error('Abonnement Redis Socket.IO impossible :', error.message);
  }

  try {
    await initializeDatabase();
  } catch (error) {
    console.error('Initialisation de la base impossible au démarrage :', error.message);
  }

  const reminderInterval = Number(process.env.SUBSCRIPTION_REMINDER_INTERVAL_MS) || 6 * 60 * 60 * 1000;
  const runReminders = () => {
    runSubscriptionReminderJob().catch((error) => {
      console.error('Tâche de rappels d’abonnement arrêtée:', error.message);
    });
  };
  runReminders();
  const reminderTimer = setInterval(runReminders, reminderInterval);
  reminderTimer.unref();

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT} on 0.0.0.0`);
  });
})();
