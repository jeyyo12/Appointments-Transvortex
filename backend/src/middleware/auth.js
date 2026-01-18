// Authentication middleware
// JWT verification și role-based authorization

import jwt from 'jsonwebtoken';
import config from '../config/env.js';

// Verify JWT token
export const verifyToken = (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token lipsă. Te rog autentifică-te.',
        error: 'NO_TOKEN',
      });
    }
    
    const decoded = jwt.verify(token, config.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expirat. Te rog autentifică-te din nou.',
        error: 'TOKEN_EXPIRED',
      });
    }
    
    return res.status(401).json({
      success: false,
      message: 'Token nevalid.',
      error: 'INVALID_TOKEN',
    });
  }
};

// Extract token from Authorization header or cookies
function extractToken(req) {
  if (req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    }
  }
  
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }
  
  return null;
}

// Role-based authorization
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Neautorizat.',
        error: 'UNAUTHORIZED',
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Nu ai permisiunea de a accesa această resursă.',
        error: 'FORBIDDEN',
      });
    }
    
    next();
  };
};

// Optional auth - verify token if present, but don't fail if missing
export const optionalAuth = (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (token) {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      req.user = decoded;
    }
  } catch (error) {
    // Silently fail - user remains unauthenticated
  }
  
  next();
};

// Generate JWT token
export const generateToken = (payload, expiresIn = config.JWT_EXPIRE) => {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn });
};

// Verify refresh token
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, config.REFRESH_TOKEN_SECRET);
  } catch (error) {
    return null;
  }
};

// Generate refresh token
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, config.REFRESH_TOKEN_SECRET, {
    expiresIn: config.REFRESH_TOKEN_EXPIRE,
  });
};
