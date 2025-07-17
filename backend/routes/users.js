const express = require('express');
const supabaseService = require('../services/supabase');
const repoManagerService = require('../services/repoManager');
const fileManagerService = require('../services/fileManager');
const { authMiddleware, adminMiddleware, userRateLimitMiddleware } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/constants');
const Helpers = require('../utils/helpers');

const router = express.Router();

// Apply authentication to all user routes
router.use(authMiddleware);

// Apply rate limiting
const userOperationRateLimit = userRateLimitMiddleware(100, 60 * 1000); // 100 operations per minute

/**
 * Get user dashboard data
 * GET /api/users/dashboard
 */
router.get('/dashboard',
  userOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      // Get storage statistics
      const storageStats = await repoManagerService.getUserStorageStatistics(req.user.id);
      
      // Get file statistics
      const fileStats = await fileManagerService.getFileStatistics(req.user.id);
      
      // Get recent files (last 10)
      const recentFiles = await fileManagerService.getUserFiles(req.user.id, { 
        limit: 10, 
        offset: 0 
      });

      // Get repositories
      const repositories = await supabaseService.getUserRepositories(req.user.id, true);

      // Calculate dashboard metrics
      const dashboardData = {
        user: {
          id: req.user.id,
          email: req.user.email,
          emailConfirmed: req.user.emailVerified,
          memberSince: req.user.createdAt,
          lastSignIn: req.user.lastSignIn
        },
        storage: {
          totalFiles: storageStats.totalFiles,
          totalSizeMb: storageStats.totalUsedStorageMb,
          totalSizeFormatted: Helpers.formatBytes(storageStats.totalUsedStorageMb * 1024 * 1024),
          availableSpaceMb: storageStats.totalAvailableStorageMb,
          availableSpaceFormatted: Helpers.formatBytes(storageStats.totalAvailableStorageMb * 1024 * 1024),
          usagePercentage: storageStats.overallUsagePercentage,
          totalRepositories: storageStats.totalRepositories,
          activeRepositories: storageStats.activeRepositories,
          estimatedMaxStorageGb: storageStats.estimatedMaxStorageGb,
          canCreateMoreRepos: storageStats.canCreateMoreRepos
        },
        files: {
          totalCount: fileStats.totalFiles,
          totalSize: fileStats.totalSize,
          totalSizeFormatted: fileStats.totalSizeFormatted,
          averageFileSize: fileStats.averageFileSize,
          averageFileSizeFormatted: fileStats.averageFileSizeFormatted,
          largestFile: fileStats.largestFile,
          largestFileFormatted: fileStats.largestFileFormatted,
          recentUploads: recentFiles.files.map(file => ({
            id: file.id,
            filename: file.originalName,
            size: file.size,
            sizeFormatted: file.sizeFormatted,
            uploadedAt: file.uploadedAt,
            downloadUrl: file.downloadUrl
          })),
          fileTypeBreakdown: fileStats.fileTypes,
          uploadHistory: fileStats.uploadsByMonth
        },
        repositories: repositories.map(repo => ({
          id: repo.id,
          name: repo.name,
          sizeMb: repo.size_mb,
          maxSizeMb: repo.max_size_mb,
          usagePercentage: (repo.size_mb / repo.max_size_mb) * 100,
          isActive: repo.is_active,
          sizeFormatted: Helpers.formatBytes(repo.size_mb * 1024 * 1024),
          availableSpaceFormatted: Helpers.formatBytes((repo.max_size_mb - repo.size_mb) * 1024 * 1024)
        })),
        activitySummary: {
          filesUploadedToday: 0, // Would need to implement date filtering
          filesUploadedThisWeek: 0,
          filesUploadedThisMonth: 0,
          storageUsedToday: 0,
          storageUsedThisWeek: 0,
          storageUsedThisMonth: 0
        }
      };

      const response = Helpers.createResponse(
        true,
        { dashboard: dashboardData },
        'Dashboard data retrieved successfully',
        'DASHBOARD_RETRIEVED'
      );

      res.json(response);

    } catch (error) {
      console.error('Dashboard data error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to retrieve dashboard data',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Get user settings/preferences
 * GET /api/users/settings
 */
router.get('/settings',
  userOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      // Get user data
      const user = await supabaseService.getUserById(req.user.id);
      
      // For now, return basic user settings
      // In a full implementation, you might have a separate settings table
      const settings = {
        user: {
          id: user.id,
          email: user.email,
          emailConfirmed: req.user.emailVerified,
          createdAt: user.created_at
        },
        preferences: {
          defaultUploadPrivacy: 'public', // Since we use public repos
          emailNotifications: true,
          autoSync: true,
          defaultFileView: 'grid', // grid or list
          itemsPerPage: 20,
          theme: 'light' // light or dark
        },
        limits: {
          maxFileSize: Helpers.formatBytes(2 * 1024 * 1024 * 1024), // 2GB
          maxRepositories: 50,
          maxFilesPerRepo: 1000
        }
      };

      const response = Helpers.createResponse(
        true,
        { settings },
        'User settings retrieved successfully',
        'SETTINGS_RETRIEVED'
      );

      res.json(response);

    } catch (error) {
      console.error('User settings error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to retrieve user settings',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Update user settings/preferences
 * PUT /api/users/settings
 */
router.put('/settings',
  userOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const { preferences = {} } = req.body;
      
      // Validate preferences
      const allowedPreferences = [
        'emailNotifications',
        'autoSync',
        'defaultFileView',
        'itemsPerPage',
        'theme'
      ];

      const validPreferences = {};
      for (const [key, value] of Object.entries(preferences)) {
        if (allowedPreferences.includes(key)) {
          validPreferences[key] = value;
        }
      }

      // In a full implementation, you would store these preferences in a database
      // For now, we'll just return the validated preferences
      
      const response = Helpers.createResponse(
        true,
        { 
          updatedPreferences: validPreferences,
          message: 'Settings updated successfully (note: persistence not implemented in MVP)'
        },
        'User settings updated successfully',
        'SETTINGS_UPDATED'
      );

      res.json(response);

    } catch (error) {
      console.error('User settings update error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to update user settings',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Get user activity log
 * GET /api/users/activity
 */
router.get('/activity',
  userOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const { limit = 50, offset = 0, type = 'all' } = req.query;
      
      // In a full implementation, you would have an activity log table
      // For now, we'll generate some sample activity based on files
      const { files } = await fileManagerService.getUserFiles(req.user.id, {
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      const activities = files.map(file => ({
        id: `activity_${file.id}`,
        type: 'file_upload',
        description: `Uploaded file: ${file.originalName}`,
        timestamp: file.uploadedAt,
        metadata: {
          fileId: file.id,
          filename: file.originalName,
          size: file.size,
          sizeFormatted: file.sizeFormatted
        }
      }));

      // Sort by timestamp (newest first)
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const response = Helpers.createResponse(
        true,
        {
          activities,
          pagination: {
            total: activities.length,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: activities.length === parseInt(limit)
          }
        },
        'Activity log retrieved successfully',
        'ACTIVITY_RETRIEVED'
      );

      res.json(response);

    } catch (error) {
      console.error('User activity error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to retrieve user activity',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Get user account summary
 * GET /api/users/summary
 */
router.get('/summary',
  userOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const storageStats = await repoManagerService.getUserStorageStatistics(req.user.id);
      const fileStats = await fileManagerService.getFileStatistics(req.user.id);

      const summary = {
        user: {
          id: req.user.id,
          email: req.user.email,
          memberSince: req.user.createdAt,
          emailConfirmed: req.user.emailVerified
        },
        totals: {
          files: fileStats.totalFiles,
          storage: {
            used: storageStats.totalUsedStorageMb,
            usedFormatted: Helpers.formatBytes(storageStats.totalUsedStorageMb * 1024 * 1024),
            available: storageStats.totalAvailableStorageMb,
            availableFormatted: Helpers.formatBytes(storageStats.totalAvailableStorageMb * 1024 * 1024),
            percentage: storageStats.overallUsagePercentage
          },
          repositories: storageStats.totalRepositories
        },
        limits: {
          maxFileSize: '2 GB',
          maxStorageEstimate: `${storageStats.estimatedMaxStorageGb.toFixed(1)} GB`,
          repositoriesRemaining: Math.max(0, 50 - storageStats.totalRepositories)
        },
        fileTypes: fileStats.fileTypes,
        recentActivity: {
          lastUpload: fileStats.totalFiles > 0 ? 'Recent' : 'None',
          uploadsThisMonth: Object.values(fileStats.uploadsByMonth).reduce((sum, count) => sum + count, 0)
        }
      };

      const response = Helpers.createResponse(
        true,
        { summary },
        'Account summary retrieved successfully',
        'SUMMARY_RETRIEVED'
      );

      res.json(response);

    } catch (error) {
      console.error('User summary error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to retrieve account summary',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Delete user account (soft delete)
 * DELETE /api/users/account
 */
router.delete('/account',
  userOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const { confirmEmail } = req.body;
      
      // Verify the user wants to delete their account
      if (confirmEmail !== req.user.email) {
        throw new AppError(
          'Email confirmation required',
          ERROR_CODES.VALIDATION_ERROR,
          400,
          'Please confirm your email address to delete your account'
        );
      }

      // In a full implementation, you would:
      // 1. Delete all user files from GitHub
      // 2. Delete all repositories
      // 3. Clean up database records
      // 4. Deactivate the Supabase auth account
      
      // For now, we'll just return a response indicating the process would start
      const response = Helpers.createResponse(
        true,
        {
          message: 'Account deletion process initiated',
          note: 'In MVP: Account deletion not fully implemented. This would delete all files, repositories, and user data.',
          estimatedDeletionTime: '24-48 hours',
          filesToDelete: 0, // Would calculate actual numbers
          repositoriesToDelete: 0
        },
        'Account deletion initiated',
        'ACCOUNT_DELETION_INITIATED'
      );

      res.json(response);

    } catch (error) {
      console.error('Account deletion error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to initiate account deletion',
        ERROR_CODES.INTERNAL_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Export user data
 * GET /api/users/export
 */
router.get('/export',
  userOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const { format = 'json' } = req.query;
      
      // Get all user data
      const user = await supabaseService.getUserById(req.user.id);
      const { files } = await fileManagerService.getUserFiles(req.user.id, { limit: 10000 });
      const repositories = await supabaseService.getUserRepositories(req.user.id);
      const storageStats = await repoManagerService.getUserStorageStatistics(req.user.id);

      const exportData = {
        exportInfo: {
          exportedAt: new Date().toISOString(),
          format,
          version: '1.0'
        },
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.created_at,
          updatedAt: user.updated_at
        },
        storage: storageStats,
        repositories: repositories.map(repo => ({
          id: repo.id,
          name: repo.name,
          githubId: repo.github_repo_id,
          sizeMb: repo.size_mb,
          maxSizeMb: repo.max_size_mb,
          isActive: repo.is_active,
          createdAt: repo.created_at
        })),
        files: files.map(file => ({
          id: file.id,
          filename: file.filename,
          originalName: file.originalName,
          sizeMb: file.sizeMb,
          mimeType: file.mimeType,
          downloadUrl: file.downloadUrl,
          uploadedAt: file.uploadedAt,
          repositoryName: file.repository.name
        }))
      };

      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="freedrive-export-${user.id}-${Date.now()}.json"`);
        res.json(exportData);
      } else {
        // For other formats, you could implement CSV, XML, etc.
        throw new AppError(
          'Unsupported export format',
          ERROR_CODES.VALIDATION_ERROR,
          400,
          'Only JSON format is currently supported'
        );
      }

    } catch (error) {
      console.error('User data export error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to export user data',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Admin route: Get all users
 * GET /api/users/admin/all
 */
router.get('/admin/all',
  adminMiddleware,
  asyncHandler(async (req, res) => {
    try {
      // This would require extending the supabase service for admin operations
      // For now, return a placeholder
      
      const response = Helpers.createResponse(
        true,
        {
          message: 'Admin user listing not implemented yet',
          totalUsers: 0,
          activeUsers: 0,
          totalStorage: 0
        },
        'Admin user data retrieved',
        'ADMIN_USERS_RETRIEVED'
      );

      res.json(response);

    } catch (error) {
      console.error('Admin user listing error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to retrieve admin user data',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  })
);

module.exports = router;
