// Authentication Routes
// Login, Register, Refresh Token, Logout

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcryptjs from 'bcryptjs';
import {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../middleware/auth.js';
import {
  asyncHandler,
  ApiError,
  formatValidationErrors,
} from '../middleware/errorHandler.js';
import { authLimiter } from '../middleware/security.js';

const router = Router();

// TODO: Replace with actual database queries
const users = new Map(); // In-memory store for demo

// Register
router.post(
  '/register',
  authLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Email nevalid'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Parola trebuie să aibă cel puțin 8 caractere')
      .matches(/[A-Z]/)
      .withMessage('Parola trebuie să conțină cel puțin o literă mare')
      .matches(/[0-9]/)
      .withMessage('Parola trebuie să conțină cel puțin o cifră'),
    body('name')
      .trim()
      .isLength({ min: 2 })
      .withMessage('Numele trebuie să aibă cel puțin 2 caractere'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Date nevalide',
        errors: formatValidationErrors(errors),
      });
    }

    const { email, password, name } = req.body;

    // Check if user exists
    if (users.has(email)) {
      throw new ApiError('Utilizator deja există', 409, 'USER_EXISTS');
    }

    // Hash password
    const hashedPassword = await bcryptjs.hash(password, 12);

    // Create user
    const user = {
      id: Math.random().toString(36).substr(2, 9),
      email,
      name,
      password: hashedPassword,
      role: 'user',
      createdAt: new Date().toISOString(),
    };

    users.set(email, user);

    // Generate tokens
    const accessToken = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = generateRefreshToken({
      id: user.id,
    });

    res.status(201).json({
      success: true,
      message: 'Utilizator creat cu succes',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        accessToken,
        refreshToken,
      },
    });
  })
);

// Login
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Email nevalid'),
    body('password').notEmpty().withMessage('Parola este obligatorie'),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Date nevalide',
        errors: formatValidationErrors(errors),
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = users.get(email);
    if (!user) {
      throw new ApiError('Email sau parola incorectă', 401, 'INVALID_CREDENTIALS');
    }

    // Verify password
    const isPasswordValid = await bcryptjs.compare(password, user.password);
    if (!isPasswordValid) {
      throw new ApiError('Email sau parola incorectă', 401, 'INVALID_CREDENTIALS');
    }

    // Generate tokens
    const accessToken = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = generateRefreshToken({
      id: user.id,
    });

    res.json({
      success: true,
      message: 'Autentificare reușită',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        accessToken,
        refreshToken,
      },
    });
  })
);

// Refresh Token
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ApiError('Refresh token lipsă', 401, 'NO_REFRESH_TOKEN');
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      throw new ApiError('Refresh token expirat', 401, 'INVALID_REFRESH_TOKEN');
    }

    const user = Array.from(users.values()).find(u => u.id === decoded.id);
    if (!user) {
      throw new ApiError('Utilizator nu găsit', 404, 'USER_NOT_FOUND');
    }

    const accessToken = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      success: true,
      message: 'Token reînnoit',
      data: { accessToken },
    });
  })
);

// Logout
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    // TODO: Invalidate refresh token in database
    res.json({
      success: true,
      message: 'Deconectat cu succes',
    });
  })
);

export default router;
