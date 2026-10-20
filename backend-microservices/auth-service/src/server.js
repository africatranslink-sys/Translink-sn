const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initializeDatabase } = require('./scripts/initDb');
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
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Translink-Africa API is running' });
});

// Import Routes
const authRoutes = require('./routes/authRoutes');
const documentRoutes = require('./routes/documentRoutes');

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'La photo dépasse la limite de 5 Mo.' });
  }
  if (err.message === 'Format non pris en charge. Utilisez une image JPEG, PNG ou WebP.') {
    return res.status(400).json({ error: err.message });
  }
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
  } catch (error) {
    console.error('Initialisation de la base impossible au démarrage :', error.message);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT} on 0.0.0.0`);
  });
})();
