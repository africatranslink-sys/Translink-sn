const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initializeDatabase } = require('./scripts/initDb');
const { startDemandExpirationService } = require('./services/demandExpirationService');
const { connectRedis } = require('../../shared/redis');
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
const camionRoutes = require('./routes/camionRoutes');
const annonceRoutes = require('./routes/annonceRoutes');

// Mount Routes
app.use('/api/camions', camionRoutes);
app.use('/api/annonces', annonceRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Une erreur interne du serveur est survenue' });
});

const PORT = process.env.PORT || 5000;

(async () => {
  try {
    await connectRedis();
  } catch (error) {
    console.error('Connexion Redis impossible au démarrage :', error.message);
    process.exit(1);
  }

  try {
    await initializeDatabase();
    startDemandExpirationService();
  } catch (error) {
    console.error('Initialisation de la base impossible au démarrage :', error.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT} on 0.0.0.0`);
  });
})();
