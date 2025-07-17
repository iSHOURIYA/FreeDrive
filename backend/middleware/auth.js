const supabaseService = require('../services/supabase');
const { AppError } = require('./errorHandler');
const { ERROR_CODES } = require('../utils/constants');

/**
 * Authentication middleware for protecting routes
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      throw new AppError(
        'Authorization header required',
        ERROR_CODES.AUTH_REQUIRED,
        401,
        'Please provide a valid authorization header'
      );
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      throw new AppError(
        'Authorization token required',
        ERROR_CODES.AUTH_REQUIRED,
        401,
        'Please provide a valid authorization token'
      );
    }

    // Verify token with Supabase
    const { data: { user }, error } = await supabaseService.client.auth.getUser(token);
    
    if (error || !user) {
      throw new AppError(
        'Invalid or expired token',
        ERROR_CODES.AUTH_INVALID,
        401,
        'Please log in again'
      );
    }

    // Add user to request object
    req.user = {
      id: user.id,
      email: user.email,
      emailVerified: user.email_confirmed_at !== null,
      createdAt: user.created_at,
      lastSignIn: user.last_sign_in_at
    };

    // Add the token for potential use in services
    req.token = token;

    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    
    console.error('Auth middleware error:', error);
    next(new AppError(
      'Authentication failed',
      ERROR_CODES.AUTH_INVALID,
      401,
      'Unable to verify authentication'
    ));
  }
};

/**
 * Optional authentication middleware - continues even if auth fails
 * Useful for routes that can work with or without authentication
 */
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      req.user = null;
      return next();
    }

    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      req.user = null;
      return next();
    }

    // Try to verify token
    const { data: { user }, error } = await supabaseService.client.auth.getUser(token);
    
    if (error || !user) {
      req.user = null;
    } else {
      req.user = {
        id: user.id,
        email: user.email,
        emailVerified: user.email_confirmed_at !== null,
        createdAt: user.created_at,
        lastSignIn: user.last_sign_in_at
      };
      req.token = token;
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    req.user = null;
    next();
  }
};

/**
 * Admin-only middleware
 * Checks if user has admin privileges
 */
const adminMiddleware = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AppError(
        'Authentication required',
        ERROR_CODES.AUTH_REQUIRED,
        401,
        'Please log in to access this resource'
      );
    }

    // Check if user is admin (you can implement your own logic)
    // For now, we'll check if user email is in a list of admin emails
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(email => email.trim());
    
    if (!adminEmails.includes(req.user.email)) {
      throw new AppError(
        'Admin access required',
        ERROR_CODES.AUTH_INVALID,
        403,
        'You do not have permission to access this resource'
      );
    }

    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    
    console.error('Admin middleware error:', error);
    next(new AppError(
      'Authorization failed',
      ERROR_CODES.AUTH_INVALID,
      403,
      'Unable to verify admin privileges'
    ));
  }
};

/**
 * Rate limiting middleware for specific users
 * Can be used to implement per-user rate limits
 */
const userRateLimitMiddleware = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get user's request history
    let userRequestHistory = userRequests.get(userId) || [];
    
    // Filter out old requests
    userRequestHistory = userRequestHistory.filter(timestamp => timestamp > windowStart);
    
    // Check if user has exceeded limit
    if (userRequestHistory.length >= maxRequests) {
      throw new AppError(
        'Rate limit exceeded',
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        429,
        `Too many requests. Maximum ${maxRequests} requests per ${windowMs / 1000} seconds.`
      );
    }

    // Add current request
    userRequestHistory.push(now);
    userRequests.set(userId, userRequestHistory);

    // Clean up old entries periodically
    if (Math.random() < 0.01) { // 1% chance
      const cutoff = now - windowMs;
      for (const [userId, timestamps] of userRequests.entries()) {
        const filtered = timestamps.filter(timestamp => timestamp > cutoff);
        if (filtered.length === 0) {
          userRequests.delete(userId);
        } else {
          userRequests.set(userId, filtered);
        }
      }
    }

    next();
  };
};

/**
 * Validate user ownership middleware
 * Ensures that users can only access their own resources
 */
const validateOwnership = (resourceKey = 'id') => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        throw new AppError(
          'Authentication required',
          ERROR_CODES.AUTH_REQUIRED,
          401,
          'Please log in to access this resource'
        );
      }

      // Get resource ID from params
      const resourceId = req.params[resourceKey];
      
      if (!resourceId) {
        throw new AppError(
          'Resource ID required',
          ERROR_CODES.VALIDATION_ERROR,
          400,
          `${resourceKey} parameter is required`
        );
      }

      // The actual ownership validation will be done in the service layer
      // This middleware just ensures we have the necessary auth context
      req.resourceId = resourceId;
      next();
    } catch (error) {
      if (error instanceof AppError) {
        return next(error);
      }
      
      console.error('Ownership validation error:', error);
      next(new AppError(
        'Ownership validation failed',
        ERROR_CODES.AUTH_INVALID,
        403,
        'Unable to verify resource ownership'
      ));
    }
  };
};

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  adminMiddleware,
  userRateLimitMiddleware,
  validateOwnership
};
