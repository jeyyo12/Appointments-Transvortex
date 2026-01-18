// Main Express Server
// Configures all middleware, routes, and error handling

import express from 'express';
import morgan from 'morgan';
import config from './config/env.js';
import { securityMiddleware } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';

const app = express();

// Trust proxy (required for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Logging middleware
if (config.LOG_FORMAT === 'json') {
  app.use(morgan('combined'));
} else {
  app.use(morgan('dev'));
}

// Security middleware
app.use(securityMiddleware);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check routes (no auth required)
app.use('/api/health', healthRouter);

// Authentication routes
app.use('/api/auth', authRouter);

// TODO: Add protected routes here
// Protected Facebook Pages API routes
// app.use('/api/pages', pagesRouter);

// 404 handler
app.use(notFoundHandler);

// Central error handler
app.use(errorHandler);

// Start server
const PORT = config.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server running on port ${PORT} (${config.NODE_ENV})`);
});

export default app;
