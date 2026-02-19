const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const authcheck = require('./middleware/authcheck');
// import { rateLimit } from 'express-rate-limit'
const { rateLimit } = require('express-rate-limit');

const app = express();
const PORT = 3000;

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

// Apply rate limiting to all requests
app.use(limiter);

// Proxy routes to microservices
app.use('/api/users', authcheck, createProxyMiddleware({
  target: 'http://user-service:3001',
  changeOrigin: true,
  pathRewrite: { '^/api/users': '/users' },
}));

app.use('/api/products', authcheck, createProxyMiddleware({
  target: 'http://product-service:3002',
  changeOrigin: true,
  pathRewrite: { '^/api/products': '/products' },
}));

app.use('/api/orders', authcheck, createProxyMiddleware({
  target: 'http://order-service:3003',
  changeOrigin: true,
  pathRewrite: { '^/api/orders': '/orders' },
}));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'Gateway is running' });
});




app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
