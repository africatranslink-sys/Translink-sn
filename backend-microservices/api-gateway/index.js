const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const morgan = require('morgan');
const http = require('http');
require('dotenv').config();
const { publishDashboardChangeEvent } = require('../shared/redis');

const app = express();

app.use(cors());
app.use(morgan('dev')); // Logging
app.use((req, res, next) => {
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const isApiRequest = req.path.startsWith('/api/');
  const isLogin = req.path === '/api/auth/login';
  const isNotificationRead = req.path.endsWith('/read');
  if (!isMutation || !isApiRequest || isLogin || isNotificationRead) return next();

  res.once('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    const resource = req.path.split('/').filter(Boolean).slice(0, 2).join('/');
    publishDashboardChangeEvent({ resource, method: req.method }).catch((error) => {
      console.error('Diffusion temps réel des données impossible :', error.message);
    });
  });
  next();
});

const socketProxy = createProxyMiddleware({
  pathFilter: '/socket.io',
  target: 'http://localhost:5003',
  changeOrigin: true,
  ws: true,
});
app.use(socketProxy);

app.use(createProxyMiddleware({
  pathFilter: '/uploads',
  target: 'http://localhost:5001',
  changeOrigin: true,
}));

// Routes pour l'Auth Service (Port 5001)
app.use(createProxyMiddleware({ 
  pathFilter: '/api-docs',
  target: 'http://localhost:5001', 
  changeOrigin: true 
}));
app.use(createProxyMiddleware({ 
  pathFilter: '/api/auth',
  target: 'http://localhost:5001', 
  changeOrigin: true 
}));
app.use(createProxyMiddleware({ 
  pathFilter: '/api/documents',
  target: 'http://localhost:5001', 
  changeOrigin: true 
}));

// Routes pour l'Annonce Service (Port 5002)
app.use(createProxyMiddleware({ 
  pathFilter: '/api/camions',
  target: 'http://localhost:5002', 
  changeOrigin: true 
}));
app.use(createProxyMiddleware({ 
  pathFilter: '/api/annonces',
  target: 'http://localhost:5002', 
  changeOrigin: true 
}));

// Routes pour le Course & Paiement Service (Port 5003)
app.use(createProxyMiddleware({ 
  pathFilter: '/api/courses',
  target: 'http://localhost:5003', 
  changeOrigin: true 
}));
app.use(createProxyMiddleware({
  pathFilter: '/api/chats',
  target: 'http://localhost:5003',
  changeOrigin: true
}));
app.use(createProxyMiddleware({ 
  pathFilter: '/api/paiements',
  target: 'http://localhost:5003', 
  changeOrigin: true 
}));
app.use(createProxyMiddleware({ 
  pathFilter: '/api/admin',
  target: 'http://localhost:5003', 
  changeOrigin: true 
}));
app.use(createProxyMiddleware({
  pathFilter: '/api/notifications',
  target: 'http://localhost:5003',
  changeOrigin: true
}));

app.get('/', (req, res) => {
  res.json({ message: 'Translink-Africa API Gateway is running' });
});

const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
httpServer.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/socket.io')) socketProxy.upgrade(req, socket, head);
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`API Gateway is running on port ${PORT} on 0.0.0.0`);
});
