// Health Check Route
// Pentru monitoring și deployment verification

import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// Health check endpoint
router.get('/health', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0',
  });
}));

// Readiness check (include DB connection)
router.get('/ready', asyncHandler(async (req, res) => {
  // TODO: Add DB connection check here
  res.json({
    success: true,
    message: 'API is ready',
    timestamp: new Date().toISOString(),
    checks: {
      database: true, // TODO: Update based on actual DB status
      cache: true,
    },
  });
}));

export default router;
