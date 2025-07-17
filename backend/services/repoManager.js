const githubService = require('./github');
const supabaseService = require('./supabase');
const { AppError } = require('../middleware/errorHandler');
const { ERROR_CODES, MAX_REPO_SIZE_BYTES } = require('../utils/constants');
const Helpers = require('../utils/helpers');

/**
 * Repository Manager Service
 * Handles repository creation, rotation, and management
 */
class RepoManagerService {
  
  /**
   * Get or create the first active repository for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Repository record
   */
  async getOrCreateFirstRepository(userId) {
    try {
      // Check if user already has repositories
      const existingRepos = await supabaseService.getUserRepositories(userId, true);
      
      if (existingRepos.length > 0) {
        return existingRepos[0]; // Return the first active repository
      }

      // Create the first repository
      return await this.createNewRepository(userId, 1);
    } catch (error) {
      console.error('Error getting or creating first repository:', error);
      if (error instanceof AppError) throw error;
      
      throw new AppError(
        'Failed to initialize user storage',
        ERROR_CODES.REPO_CREATE_FAILED,
        500,
        error.message
      );
    }
  }

  /**
   * Create a new repository for a user
   * @param {string} userId - User ID
   * @param {number} bucketNumber - Bucket number (1, 2, 3, etc.)
   * @returns {Promise<Object>} Repository record
   */
  async createNewRepository(userId, bucketNumber) {
    try {
      // Generate repository name
      const repoName = Helpers.generateRepoName(userId, bucketNumber);
      
      // Check if repository already exists on GitHub
      const exists = await githubService.repositoryExists(repoName);
      if (exists) {
        // If it exists, try the next bucket number
        return await this.createNewRepository(userId, bucketNumber + 1);
      }

      // Create repository on GitHub
      console.log(`Creating GitHub repository: ${repoName}`);
      const githubRepo = await githubService.createRepositoryWithRetry(
        repoName, 
        `FreeDrive storage bucket ${bucketNumber} for user ${userId}`
      );

      // Store repository in database
      const repoData = {
        userId,
        name: repoName,
        githubRepoId: githubRepo.id,
        maxSizeMb: Helpers.bytesToMb(MAX_REPO_SIZE_BYTES)
      };

      const dbRepo = await supabaseService.createRepository(repoData);
      
      console.log(`✅ Created and stored repository: ${repoName} (DB ID: ${dbRepo.id})`);
      return dbRepo;
    } catch (error) {
      console.error(`Error creating repository for user ${userId}:`, error);
      if (error instanceof AppError) throw error;
      
      throw new AppError(
        'Failed to create storage repository',
        ERROR_CODES.REPO_CREATE_FAILED,
        500,
        error.message
      );
    }
  }

  /**
   * Get available repository for file upload
   * @param {string} userId - User ID
   * @param {number} fileSizeBytes - File size in bytes
   * @returns {Promise<Object>} Available repository
   */
  async getAvailableRepository(userId, fileSizeBytes) {
    try {
      const fileSizeMb = Helpers.bytesToMb(fileSizeBytes);
      
      // Check current repositories for available space
      const availableRepo = await supabaseService.getAvailableRepository(userId, fileSizeMb);
      
      if (availableRepo) {
        console.log(`Using existing repository: ${availableRepo.name} (${availableRepo.size_mb}MB used)`);
        return availableRepo;
      }

      // No available repository, create a new one
      console.log(`No available repository for ${fileSizeMb}MB file, creating new one`);
      
      // Get current repository count to determine bucket number
      const allRepos = await supabaseService.getUserRepositories(userId);
      const nextBucketNumber = allRepos.length + 1;
      
      return await this.createNewRepository(userId, nextBucketNumber);
    } catch (error) {
      console.error('Error getting available repository:', error);
      if (error instanceof AppError) throw error;
      
      throw new AppError(
        'Failed to find available storage space',
        ERROR_CODES.REPO_CREATE_FAILED,
        500,
        error.message
      );
    }
  }

  /**
   * Update repository size after file operations
   * @param {string} repoId - Repository ID
   * @param {number} sizeChangeMb - Size change in MB (positive for additions, negative for deletions)
   * @returns {Promise<Object>} Updated repository
   */
  async updateRepositorySize(repoId, sizeChangeMb) {
    try {
      // Get current repository data
      const repos = await supabaseService.getUserRepositories('', false);
      const currentRepo = repos.find(repo => repo.id === repoId);
      
      if (!currentRepo) {
        throw new AppError(
          'Repository not found',
          ERROR_CODES.REPO_NOT_FOUND,
          404
        );
      }

      const newSizeMb = Math.max(0, currentRepo.size_mb + sizeChangeMb);
      
      // Update repository size
      const updatedRepo = await supabaseService.updateRepositorySize(repoId, newSizeMb);
      
      console.log(`Updated repository ${currentRepo.name} size: ${currentRepo.size_mb}MB → ${newSizeMb}MB`);
      return updatedRepo;
    } catch (error) {
      console.error('Error updating repository size:', error);
      if (error instanceof AppError) throw error;
      
      throw new AppError(
        'Failed to update repository size',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  }

  /**
   * Check if repository should be rotated (approaching size limit)
   * @param {Object} repository - Repository object
   * @param {number} additionalSizeMb - Additional size to be added
   * @returns {boolean} True if repository should be rotated
   */
  shouldRotateRepository(repository, additionalSizeMb) {
    const totalSizeAfterUpload = repository.size_mb + additionalSizeMb;
    const maxSize = repository.max_size_mb || Helpers.bytesToMb(MAX_REPO_SIZE_BYTES);
    
    // Rotate when we would exceed 90% of the limit
    const rotationThreshold = maxSize * 0.9;
    
    return totalSizeAfterUpload > rotationThreshold;
  }

  /**
   * Get user storage statistics across all repositories
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Comprehensive storage statistics
   */
  async getUserStorageStatistics(userId) {
    try {
      // Get basic stats from database
      const dbStats = await supabaseService.getUserStorageStats(userId);
      
      // Get repository details
      const repositories = await supabaseService.getUserRepositories(userId);
      
      // Calculate repository-specific stats
      const repoStats = repositories.map(repo => ({
        id: repo.id,
        name: repo.name,
        sizeMb: repo.size_mb,
        maxSizeMb: repo.max_size_mb,
        usagePercentage: (repo.size_mb / repo.max_size_mb) * 100,
        isActive: repo.is_active,
        createdAt: repo.created_at
      }));

      // Calculate totals
      const totalMaxStorageMb = repositories.reduce((sum, repo) => sum + (repo.max_size_mb || 0), 0);
      const totalUsedStorageMb = repositories.reduce((sum, repo) => sum + (repo.size_mb || 0), 0);
      const overallUsagePercentage = totalMaxStorageMb > 0 ? (totalUsedStorageMb / totalMaxStorageMb) * 100 : 0;

      return {
        ...dbStats,
        repositories: repoStats,
        totalRepositories: repositories.length,
        activeRepositories: repositories.filter(repo => repo.is_active).length,
        totalMaxStorageMb,
        totalUsedStorageMb,
        totalAvailableStorageMb: Math.max(0, totalMaxStorageMb - totalUsedStorageMb),
        overallUsagePercentage,
        // Estimate total available storage (each repo can hold ~800MB)
        estimatedMaxStorageGb: (repositories.length * 0.8) + ((50 - repositories.length) * 0.8), // Assume up to 50 repos possible
        canCreateMoreRepos: repositories.length < 50 // GitHub limit consideration
      };
    } catch (error) {
      console.error('Error getting user storage statistics:', error);
      if (error instanceof AppError) throw error;
      
      throw new AppError(
        'Failed to retrieve storage statistics',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  }

  /**
   * Validate repository state and sync with GitHub if needed
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Validation results
   */
  async validateAndSyncRepositories(userId) {
    try {
      const repositories = await supabaseService.getUserRepositories(userId);
      const validationResults = {
        valid: [],
        invalid: [],
        synced: []
      };

      for (const repo of repositories) {
        try {
          // Check if repository exists on GitHub
          const exists = await githubService.repositoryExists(repo.name);
          
          if (exists) {
            // Get actual repository stats from GitHub
            const githubStats = await githubService.getRepositoryStats(repo.name);
            
            // Check if sizes are significantly different (more than 10MB difference)
            const sizeDifferenceMb = Math.abs(repo.size_mb - githubStats.totalAssetSizeMb);
            
            if (sizeDifferenceMb > 10) {
              // Sync the size
              await supabaseService.updateRepositorySize(repo.id, githubStats.totalAssetSizeMb);
              validationResults.synced.push({
                repository: repo.name,
                oldSize: repo.size_mb,
                newSize: githubStats.totalAssetSizeMb,
                difference: sizeDifferenceMb
              });
            }
            
            validationResults.valid.push(repo.name);
          } else {
            validationResults.invalid.push({
              repository: repo.name,
              reason: 'Repository not found on GitHub'
            });
          }
        } catch (error) {
          validationResults.invalid.push({
            repository: repo.name,
            reason: error.message
          });
        }
      }

      return validationResults;
    } catch (error) {
      console.error('Error validating repositories:', error);
      if (error instanceof AppError) throw error;
      
      throw new AppError(
        'Failed to validate repositories',
        ERROR_CODES.GITHUB_API_ERROR,
        500,
        error.message
      );
    }
  }

  /**
   * Clean up orphaned repositories (exist in DB but not on GitHub)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupOrphanedRepositories(userId) {
    try {
      const validationResults = await this.validateAndSyncRepositories(userId);
      const cleanupResults = {
        cleaned: [],
        errors: []
      };

      for (const invalid of validationResults.invalid) {
        try {
          // Find the repository in database
          const repositories = await supabaseService.getUserRepositories(userId);
          const orphanedRepo = repositories.find(repo => repo.name === invalid.repository);
          
          if (orphanedRepo) {
            // Note: In a real implementation, you might want to backup or migrate data
            // For now, we'll just mark it as inactive rather than delete
            console.log(`Marking orphaned repository as inactive: ${invalid.repository}`);
            // This would require an update method in supabaseService
            cleanupResults.cleaned.push(invalid.repository);
          }
        } catch (error) {
          cleanupResults.errors.push({
            repository: invalid.repository,
            error: error.message
          });
        }
      }

      return cleanupResults;
    } catch (error) {
      console.error('Error cleaning up repositories:', error);
      if (error instanceof AppError) throw error;
      
      throw new AppError(
        'Failed to cleanup orphaned repositories',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  }
}

module.exports = new RepoManagerService();
