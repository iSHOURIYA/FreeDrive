const express = require('express');
const supabaseService = require('../services/supabase');
const repoManagerService = require('../services/repoManager');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/constants');
const Helpers = require('../utils/helpers');

const router = express.Router();

/**
 * Register a new user
 * POST /api/auth/register
 */
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    throw new AppError(
      'Email and password are required',
      ERROR_CODES.VALIDATION_ERROR,
      400,
      'Please provide both email and password'
    );
  }

  if (!Helpers.isValidEmail(email)) {
    throw new AppError(
      'Invalid email format',
      ERROR_CODES.VALIDATION_ERROR,
      400,
      'Please provide a valid email address'
    );
  }

  if (password.length < 8) {
    throw new AppError(
      'Password too short',
      ERROR_CODES.VALIDATION_ERROR,
      400,
      'Password must be at least 8 characters long'
    );
  }

  try {
    // Register user with Supabase Auth
    const { data: authData, error: authError } = await supabaseService.client.auth.signUp({
      email,
      password
    });

    if (authError) {
      console.error('Supabase auth registration error:', authError);
      
      if (authError.message.includes('already registered')) {
        throw new AppError(
          'User already exists',
          ERROR_CODES.VALIDATION_ERROR,
          409,
          'An account with this email already exists'
        );
      }
      
      throw new AppError(
        'Registration failed',
        ERROR_CODES.AUTH_INVALID,
        400,
        authError.message
      );
    }

    if (!authData.user) {
      throw new AppError(
        'Registration failed',
        ERROR_CODES.AUTH_INVALID,
        400,
        'Failed to create user account'
      );
    }

    // Create user record in our database
    const userData = {
      id: authData.user.id,
      email: authData.user.email
    };

    const dbUser = await supabaseService.createUser(userData);

    // Create the first repository for the user
    console.log(`Creating first repository for user: ${authData.user.email}`);
    await repoManagerService.getOrCreateFirstRepository(authData.user.id);

    const response = Helpers.createResponse(
      true,
      {
        user: {
          id: authData.user.id,
          email: authData.user.email,
          emailConfirmed: authData.user.email_confirmed_at !== null,
          createdAt: authData.user.created_at
        },
        session: authData.session ? {
          accessToken: authData.session.access_token,
          refreshToken: authData.session.refresh_token,
          expiresAt: authData.session.expires_at
        } : null,
        needsEmailConfirmation: !authData.user.email_confirmed_at
      },
      'User registered successfully',
      'USER_REGISTERED'
    );

    res.status(201).json(response);

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    console.error('Registration error:', error);
    throw new AppError(
      'Registration failed',
      ERROR_CODES.INTERNAL_ERROR,
      500,
      'Unable to complete registration'
    );
  }
}));

/**
 * Login user
 * POST /api/auth/login
 */
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    throw new AppError(
      'Email and password are required',
      ERROR_CODES.VALIDATION_ERROR,
      400,
      'Please provide both email and password'
    );
  }

  try {
    // Authenticate with Supabase
    const { data: authData, error: authError } = await supabaseService.client.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      console.error('Supabase auth login error:', authError);
      
      if (authError.message.includes('Invalid login credentials')) {
        throw new AppError(
          'Invalid credentials',
          ERROR_CODES.AUTH_INVALID,
          401,
          'Invalid email or password'
        );
      }
      
      throw new AppError(
        'Login failed',
        ERROR_CODES.AUTH_INVALID,
        401,
        authError.message
      );
    }

    if (!authData.user || !authData.session) {
      throw new AppError(
        'Login failed',
        ERROR_CODES.AUTH_INVALID,
        401,
        'Failed to authenticate user'
      );
    }

    // Ensure user exists in our database
    try {
      await supabaseService.getUserById(authData.user.id);
    } catch (userError) {
      // User doesn't exist in our database, create them
      if (userError.code === ERROR_CODES.DATABASE_ERROR) {
        const userData = {
          id: authData.user.id,
          email: authData.user.email
        };
        await supabaseService.createUser(userData);
        
        // Create first repository
        await repoManagerService.getOrCreateFirstRepository(authData.user.id);
      }
    }

    const response = Helpers.createResponse(
      true,
      {
        user: {
          id: authData.user.id,
          email: authData.user.email,
          emailConfirmed: authData.user.email_confirmed_at !== null,
          lastSignIn: authData.user.last_sign_in_at,
          createdAt: authData.user.created_at
        },
        session: {
          accessToken: authData.session.access_token,
          refreshToken: authData.session.refresh_token,
          expiresAt: authData.session.expires_at,
          expiresIn: authData.session.expires_in
        }
      },
      'Login successful',
      'LOGIN_SUCCESS'
    );

    res.json(response);

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    console.error('Login error:', error);
    throw new AppError(
      'Login failed',
      ERROR_CODES.INTERNAL_ERROR,
      500,
      'Unable to complete login'
    );
  }
}));

/**
 * Logout user
 * POST /api/auth/logout
 */
router.post('/logout', authMiddleware, asyncHandler(async (req, res) => {
  try {
    // Logout with Supabase
    const { error } = await supabaseService.client.auth.signOut();
    
    if (error) {
      console.error('Supabase logout error:', error);
      // Don't throw error for logout failures - still return success
    }

    const response = Helpers.createResponse(
      true,
      null,
      'Logout successful',
      'LOGOUT_SUCCESS'
    );

    res.json(response);

  } catch (error) {
    console.error('Logout error:', error);
    
    // Even if logout fails on the server side, we should return success
    // so the client can clear local storage
    const response = Helpers.createResponse(
      true,
      null,
      'Logout completed',
      'LOGOUT_SUCCESS'
    );

    res.json(response);
  }
}));

/**
 * Get current user profile
 * GET /api/auth/profile
 */
router.get('/profile', authMiddleware, asyncHandler(async (req, res) => {
  try {
    // Get user data from database
    const dbUser = await supabaseService.getUserById(req.user.id);
    
    // Get storage statistics
    const storageStats = await repoManagerService.getUserStorageStatistics(req.user.id);

    const response = Helpers.createResponse(
      true,
      {
        user: {
          id: req.user.id,
          email: req.user.email,
          emailConfirmed: req.user.emailVerified,
          createdAt: req.user.createdAt,
          lastSignIn: req.user.lastSignIn
        },
        storage: {
          totalFiles: storageStats.totalFiles,
          totalSizeMb: storageStats.totalUsedStorageMb,
          totalSizeFormatted: Helpers.formatBytes(storageStats.totalUsedStorageMb * 1024 * 1024),
          totalRepositories: storageStats.totalRepositories,
          usagePercentage: storageStats.overallUsagePercentage,
          availableStorageGb: storageStats.totalAvailableStorageMb / 1024,
          estimatedMaxStorageGb: storageStats.estimatedMaxStorageGb
        }
      },
      'Profile retrieved successfully',
      'PROFILE_SUCCESS'
    );

    res.json(response);

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    console.error('Profile retrieval error:', error);
    throw new AppError(
      'Failed to retrieve profile',
      ERROR_CODES.DATABASE_ERROR,
      500,
      'Unable to get user profile'
    );
  }
}));

/**
 * Refresh authentication token
 * POST /api/auth/refresh
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError(
      'Refresh token required',
      ERROR_CODES.VALIDATION_ERROR,
      400,
      'Please provide a valid refresh token'
    );
  }

  try {
    // Refresh session with Supabase
    const { data: authData, error: authError } = await supabaseService.client.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (authError) {
      console.error('Token refresh error:', authError);
      throw new AppError(
        'Token refresh failed',
        ERROR_CODES.AUTH_EXPIRED,
        401,
        'Refresh token is invalid or expired'
      );
    }

    if (!authData.session) {
      throw new AppError(
        'Token refresh failed',
        ERROR_CODES.AUTH_EXPIRED,
        401,
        'Unable to refresh session'
      );
    }

    const response = Helpers.createResponse(
      true,
      {
        session: {
          accessToken: authData.session.access_token,
          refreshToken: authData.session.refresh_token,
          expiresAt: authData.session.expires_at,
          expiresIn: authData.session.expires_in
        },
        user: authData.user ? {
          id: authData.user.id,
          email: authData.user.email,
          emailConfirmed: authData.user.email_confirmed_at !== null
        } : null
      },
      'Token refreshed successfully',
      'TOKEN_REFRESH_SUCCESS'
    );

    res.json(response);

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    console.error('Token refresh error:', error);
    throw new AppError(
      'Token refresh failed',
      ERROR_CODES.INTERNAL_ERROR,
      500,
      'Unable to refresh authentication token'
    );
  }
}));

/**
 * Verify email
 * POST /api/auth/verify-email
 */
router.post('/verify-email', asyncHandler(async (req, res) => {
  const { token, type = 'signup' } = req.body;

  if (!token) {
    throw new AppError(
      'Verification token required',
      ERROR_CODES.VALIDATION_ERROR,
      400,
      'Please provide a valid verification token'
    );
  }

  try {
    // Verify email with Supabase
    const { data: authData, error: authError } = await supabaseService.client.auth.verifyOtp({
      token_hash: token,
      type: type
    });

    if (authError) {
      console.error('Email verification error:', authError);
      throw new AppError(
        'Email verification failed',
        ERROR_CODES.AUTH_INVALID,
        400,
        'Verification token is invalid or expired'
      );
    }

    const response = Helpers.createResponse(
      true,
      {
        user: authData.user ? {
          id: authData.user.id,
          email: authData.user.email,
          emailConfirmed: authData.user.email_confirmed_at !== null
        } : null,
        session: authData.session
      },
      'Email verified successfully',
      'EMAIL_VERIFIED'
    );

    res.json(response);

  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    console.error('Email verification error:', error);
    throw new AppError(
      'Email verification failed',
      ERROR_CODES.INTERNAL_ERROR,
      500,
      'Unable to verify email'
    );
  }
}));

/**
 * Check authentication status
 * GET /api/auth/status
 */
router.get('/status', optionalAuthMiddleware, asyncHandler(async (req, res) => {
  const response = Helpers.createResponse(
    true,
    {
      authenticated: !!req.user,
      user: req.user || null
    },
    'Authentication status retrieved',
    'AUTH_STATUS'
  );

  res.json(response);
}));

module.exports = router;
