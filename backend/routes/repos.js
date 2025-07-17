const express = require('express');
const repoManagerService = require('../services/repoManager');
const githubService = require('../services/github');
const supabaseService = require('../services/supabase');
const { authMiddleware, adminMiddleware, userRateLimitMiddleware } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/constants');
const Helpers = require('../utils/helpers');

const router = express.Router();

// Apply authentication to all repository routes
router.use(authMiddleware);

// Apply rate limiting
const repoOperationRateLimit = userRateLimitMiddleware(50, 60 * 1000); // 50 operations per minute

/**
 * Get user repositories
 * GET /api/repos
 */
router.get('/',
  repoOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const { includeInactive = false } = req.query;
      
      const repositories = await supabaseService.getUserRepositories(
        req.user.id, 
        !includeInactive // activeOnly = !includeInactive
      );

      // Format repositories for response
      const formattedRepos = repositories.map(repo => ({
        id: repo.id,
        name: repo.name,
        githubId: repo.github_repo_id,
        sizeMb: repo.size_mb,
        maxSizeMb: repo.max_size_mb,
        usagePercentage: (repo.size_mb / repo.max_size_mb) * 100,
        isActive: repo.is_active,
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        sizeFormatted: Helpers.formatBytes(repo.size_mb * 1024 * 1024),
        maxSizeFormatted: Helpers.formatBytes(repo.max_size_mb * 1024 * 1024),
        availableSpaceMb: Math.max(0, repo.max_size_mb - repo.size_mb),
        availableSpaceFormatted: Helpers.formatBytes(Math.max(0, repo.max_size_mb - repo.size_mb) * 1024 * 1024)
      }));

      const response = Helpers.createResponse(
        true,
        {
          repositories: formattedRepos,
          total: formattedRepos.length,
          active: formattedRepos.filter(repo => repo.isActive).length,
          inactive: formattedRepos.filter(repo => !repo.isActive).length
        },
        'Repositories retrieved successfully',
        'REPOS_RETRIEVED'
      );

      res.json(response);

    } catch (error) {
      console.error('Repository retrieval error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to retrieve repositories',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Create a new repository
 * POST /api/repos/create
 */
router.post('/create',
  repoOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      // Check if user can create more repositories
      const storageStats = await repoManagerService.getUserStorageStatistics(req.user.id);
      
      if (!storageStats.canCreateMoreRepos) {
        throw new AppError(
          'Repository limit reached',
          ERROR_CODES.REPO_CREATE_FAILED,
          400,
          'Maximum number of repositories reached'
        );
      }

      // Get next bucket number
      const existingRepos = await supabaseService.getUserRepositories(req.user.id);
      const nextBucketNumber = existingRepos.length + 1;

      // Create new repository
      const newRepo = await repoManagerService.createNewRepository(req.user.id, nextBucketNumber);

      const formattedRepo = {
        id: newRepo.id,
        name: newRepo.name,
        githubId: newRepo.github_repo_id,
        sizeMb: newRepo.size_mb,
        maxSizeMb: newRepo.max_size_mb,
        usagePercentage: 0,
        isActive: newRepo.is_active,
        createdAt: newRepo.created_at,
        sizeFormatted: Helpers.formatBytes(0),
        maxSizeFormatted: Helpers.formatBytes(newRepo.max_size_mb * 1024 * 1024),
        availableSpaceMb: newRepo.max_size_mb,
        availableSpaceFormatted: Helpers.formatBytes(newRepo.max_size_mb * 1024 * 1024)
      };

      const response = Helpers.createResponse(
        true,
        { repository: formattedRepo },
        'Repository created successfully',
        'REPO_CREATED'
      );

      res.status(201).json(response);

    } catch (error) {
      console.error('Repository creation error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to create repository',
        ERROR_CODES.REPO_CREATE_FAILED,
        500,
        error.message
      );
    }
  })
);

/**
 * Get repository details by ID
 * GET /api/repos/:id
 */
router.get('/:id',
  repoOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const repoId = req.params.id;
      
      // Get repository from database
      const repositories = await supabaseService.getUserRepositories(req.user.id);
      const repository = repositories.find(repo => repo.id === repoId);

      if (!repository) {
        throw new AppError(
          'Repository not found',
          ERROR_CODES.REPO_NOT_FOUND,
          404,
          'The requested repository does not exist or you do not have access to it'
        );
      }

      // Get files in this repository
      const { files } = await supabaseService.getUserFiles(req.user.id, 1000, 0);
      const repoFiles = files.filter(file => file.repo_id === repoId);

      const formattedRepo = {
        id: repository.id,
        name: repository.name,
        githubId: repository.github_repo_id,
        sizeMb: repository.size_mb,
        maxSizeMb: repository.max_size_mb,
        usagePercentage: (repository.size_mb / repository.max_size_mb) * 100,
        isActive: repository.is_active,
        createdAt: repository.created_at,
        updatedAt: repository.updated_at,
        sizeFormatted: Helpers.formatBytes(repository.size_mb * 1024 * 1024),
        maxSizeFormatted: Helpers.formatBytes(repository.max_size_mb * 1024 * 1024),
        availableSpaceMb: Math.max(0, repository.max_size_mb - repository.size_mb),
        availableSpaceFormatted: Helpers.formatBytes(Math.max(0, repository.max_size_mb - repository.size_mb) * 1024 * 1024),
        fileCount: repoFiles.length,
        files: repoFiles.map(file => ({
          id: file.id,
          filename: file.filename,
          originalName: file.original_name,
          sizeMb: file.size_mb,
          sizeFormatted: Helpers.formatBytes(file.size_mb * 1024 * 1024),
          mimeType: file.mime_type,
          createdAt: file.created_at
        }))
      };

      const response = Helpers.createResponse(
        true,
        { repository: formattedRepo },
        'Repository details retrieved successfully',
        'REPO_DETAILS_RETRIEVED'
      );

      res.json(response);

    } catch (error) {
      console.error('Repository details error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to retrieve repository details',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Get storage usage statistics
 * GET /api/repos/usage
 */
router.get('/usage/stats',
  repoOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const storageStats = await repoManagerService.getUserStorageStatistics(req.user.id);

      const response = Helpers.createResponse(
        true,
        { 
          storage: storageStats,
          formattedStorage: {
            totalUsedFormatted: Helpers.formatBytes(storageStats.totalUsedStorageMb * 1024 * 1024),
            totalAvailableFormatted: Helpers.formatBytes(storageStats.totalAvailableStorageMb * 1024 * 1024),
            estimatedMaxFormatted: `${storageStats.estimatedMaxStorageGb.toFixed(1)} GB`
          }
        },
        'Storage statistics retrieved successfully',
        'STORAGE_STATS_RETRIEVED'
      );

      res.json(response);

    } catch (error) {
      console.error('Storage statistics error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to retrieve storage statistics',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Sync repository data with GitHub
 * POST /api/repos/:id/sync
 */
router.post('/:id/sync',
  repoOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const repoId = req.params.id;
      
      // Get repository from database
      const repositories = await supabaseService.getUserRepositories(req.user.id);
      const repository = repositories.find(repo => repo.id === repoId);

      if (!repository) {
        throw new AppError(
          'Repository not found',
          ERROR_CODES.REPO_NOT_FOUND,
          404,
          'The requested repository does not exist'
        );
      }

      // Get GitHub repository stats
      const githubStats = await githubService.getRepositoryStats(repository.name);
      
      // Update repository size if different
      const sizeDifferenceMb = Math.abs(repository.size_mb - githubStats.totalAssetSizeMb);
      
      let updatedRepo = repository;
      if (sizeDifferenceMb > 1) { // Only update if difference is more than 1MB
        updatedRepo = await supabaseService.updateRepositorySize(repoId, githubStats.totalAssetSizeMb);
      }

      const syncResult = {
        repository: {
          id: updatedRepo.id,
          name: updatedRepo.name,
          sizeMb: updatedRepo.size_mb,
          maxSizeMb: updatedRepo.max_size_mb
        },
        githubStats: {
          repoSize: githubStats.repoSize,
          releaseCount: githubStats.releaseCount,
          assetCount: githubStats.assetCount,
          totalAssetSizeMb: githubStats.totalAssetSizeMb
        },
        syncInfo: {
          sizeDifferenceMb,
          wasUpdated: sizeDifferenceMb > 1,
          syncedAt: new Date().toISOString()
        }
      };

      const response = Helpers.createResponse(
        true,
        { sync: syncResult },
        'Repository synced successfully',
        'REPO_SYNCED'
      );

      res.json(response);

    } catch (error) {
      console.error('Repository sync error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to sync repository',
        ERROR_CODES.GITHUB_API_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Validate and sync all user repositories
 * POST /api/repos/validate
 */
router.post('/validate',
  repoOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const validationResults = await repoManagerService.validateAndSyncRepositories(req.user.id);

      const response = Helpers.createResponse(
        true,
        { validation: validationResults },
        'Repository validation completed',
        'REPOS_VALIDATED'
      );

      res.json(response);

    } catch (error) {
      console.error('Repository validation error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to validate repositories',
        ERROR_CODES.GITHUB_API_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Get GitHub API rate limit status
 * GET /api/repos/github/rate-limit
 */
router.get('/github/rate-limit',
  repoOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const rateLimit = await githubService.getRateLimit();

      const response = Helpers.createResponse(
        true,
        { rateLimit },
        'GitHub rate limit retrieved successfully',
        'RATE_LIMIT_RETRIEVED'
      );

      res.json(response);

    } catch (error) {
      console.error('Rate limit check error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to check GitHub rate limit',
        ERROR_CODES.GITHUB_API_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Admin route: Get all repositories across all users
 * GET /api/repos/admin/all
 */
router.get('/admin/all',
  adminMiddleware,
  asyncHandler(async (req, res) => {
    try {
      // This would require extending the supabase service to get all repositories
      // For now, return a placeholder response
      
      const response = Helpers.createResponse(
        true,
        { 
          message: 'Admin repository listing not implemented yet',
          totalUsers: 0,
          totalRepositories: 0,
          totalStorageUsed: 0
        },
        'Admin repository data retrieved',
        'ADMIN_REPOS_RETRIEVED'
      );

      res.json(response);

    } catch (error) {
      console.error('Admin repository listing error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to retrieve admin repository data',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  })
);

/**
 * Clean up orphaned repositories
 * POST /api/repos/cleanup
 */
router.post('/cleanup',
  repoOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const cleanupResults = await repoManagerService.cleanupOrphanedRepositories(req.user.id);

      const response = Helpers.createResponse(
        true,
        { cleanup: cleanupResults },
        'Repository cleanup completed',
        'REPOS_CLEANED'
      );

      res.json(response);

    } catch (error) {
      console.error('Repository cleanup error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to cleanup repositories',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  })
);

module.exports = router;
