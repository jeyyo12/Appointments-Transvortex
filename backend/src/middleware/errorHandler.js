// Error Handler Middleware
// Centralized error handling - no stack trace leaks in production

export const errorHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Log error
  console.error({
    timestamp: new Date().toISOString(),
    status,
    message: err.message,
    path: req.path,
    method: req.method,
    ...(isDevelopment && { stack: err.stack }),
  });
  
  // Construct response
  const response = {
    success: false,
    message: err.message || 'A apărut o eroare server.',
    error: err.code || 'INTERNAL_SERVER_ERROR',
  };
  
  // Add stack trace only in development
  if (isDevelopment) {
    response.stack = err.stack;
  }
  
  res.status(status).json(response);
};

// 404 Handler
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta ${req.path} nu a fost găsită.`,
    error: 'NOT_FOUND',
  });
};

// Async error wrapper - pentru Express routes
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Validation error formatter
export const formatValidationErrors = (errors) => {
  const formatted = {};
  
  errors.array().forEach(error => {
    if (!formatted[error.param]) {
      formatted[error.param] = [];
    }
    formatted[error.param].push(error.msg);
  });
  
  return formatted;
};

// Custom error class
export class ApiError extends Error {
  constructor(message, status = 500, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
