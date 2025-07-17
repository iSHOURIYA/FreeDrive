const { Octokit } = require('@octokit/rest');
const { AppError } = require('../middleware/errorHandler');
const { ERROR_CODES, MAX_RETRIES } = require('../utils/constants');
const Helpers = require('../utils/helpers');

/**
 * GitHub service for repository and file management
 */
class GitHubService {
  constructor() {
    this.token = process.env.GITHUB_TOKEN;
    this.username = process.env.GITHUB_USERNAME;

    if (!this.token || !this.username) {
      throw new Error('GitHub configuration is missing. Please check GITHUB_TOKEN and GITHUB_USERNAME environment variables.');
    }

    this.octokit = new Octokit({
      auth: this.token,
      request: {
        timeout: 30000 // 30 seconds timeout
      }
    });
  }

  /**
   * Handle GitHub API errors
   * @param {Object} error - GitHub API error
   * @param {string} operation - Operation being performed
   * @throws {AppError}
   */
  handleGitHubError(error, operation) {
    console.error(`GitHub ${operation} error:`, error);

    if (error.status === 401) {
      throw new AppError(
        'GitHub authentication failed',
        ERROR_CODES.GITHUB_UNAUTHORIZED,
        401,
        'Invalid or expired GitHub token'
      );
    }

    if (error.status === 403) {
      const rateLimitRemaining = error.response?.headers?.['x-ratelimit-remaining'];
      const rateLimitReset = error.response?.headers?.['x-ratelimit-reset'];
      
      if (rateLimitRemaining === '0') {
        const resetTime = rateLimitReset ? new Date(rateLimitReset * 1000) : 'unknown';
        throw new AppError(
          'GitHub API rate limit exceeded',
          ERROR_CODES.GITHUB_RATE_LIMIT,
          429,
          `Rate limit resets at ${resetTime}`
        );
      }

      throw new AppError(
        'GitHub API access forbidden',
        ERROR_CODES.GITHUB_UNAUTHORIZED,
        403,
        'Insufficient permissions or repository access denied'
      );
    }

    if (error.status === 404) {
      throw new AppError(
        'GitHub resource not found',
        ERROR_CODES.GITHUB_API_ERROR,
        404,
        `Repository or resource not found for ${operation}`
      );
    }

    if (error.status === 422) {
      throw new AppError(
        'GitHub API validation error',
        ERROR_CODES.GITHUB_API_ERROR,
        422,
        error.response?.data?.message || 'Invalid request data'
      );
    }

    // Generic GitHub API error
    throw new AppError(
      `GitHub ${operation} failed`,
      ERROR_CODES.GITHUB_API_ERROR,
      error.status || 500,
      error.message
    );
  }

  /**
   * Create a new repository
   * @param {string} repoName - Repository name
   * @param {string} description - Repository description
   * @returns {Promise<Object>} Repository data
   */
  async createRepository(repoName, description = 'FreeDrive storage bucket') {
    try {
      const { data } = await this.octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description,
        private: false, // Public repos for free storage
        has_issues: false,
        has_projects: false,
        has_wiki: false,
        auto_init: true, // Initialize with README
        license_template: 'mit'
      });

      console.log(`✅ Created repository: ${repoName}`);
      return {
        id: data.id.toString(),
        name: data.name,
        fullName: data.full_name,
        url: data.html_url,
        cloneUrl: data.clone_url,
        size: data.size,
        createdAt: data.created_at
      };
    } catch (error) {
      this.handleGitHubError(error, 'repository creation');
    }
  }

  /**
   * Create a repository with retry logic
   * @param {string} repoName - Repository name
   * @param {string} description - Repository description
   * @returns {Promise<Object>} Repository data
   */
  async createRepositoryWithRetry(repoName, description) {
    return Helpers.retryWithBackoff(
      () => this.createRepository(repoName, description),
      MAX_RETRIES,
      1000
    );
  }

  /**
   * Check if repository exists
   * @param {string} repoName - Repository name
   * @returns {Promise<boolean>} True if repository exists
   */
  async repositoryExists(repoName) {
    try {
      await this.octokit.repos.get({
        owner: this.username,
        repo: repoName
      });
      return true;
    } catch (error) {
      if (error.status === 404) {
        return false;
      }
      this.handleGitHubError(error, 'repository existence check');
    }
  }

  /**
   * Get repository information
   * @param {string} repoName - Repository name
   * @returns {Promise<Object>} Repository data
   */
  async getRepository(repoName) {
    try {
      const { data } = await this.octokit.repos.get({
        owner: this.username,
        repo: repoName
      });

      return {
        id: data.id.toString(),
        name: data.name,
        fullName: data.full_name,
        size: data.size,
        updatedAt: data.updated_at
      };
    } catch (error) {
      this.handleGitHubError(error, 'repository retrieval');
    }
  }

  /**
   * Create a release in the repository
   * @param {string} repoName - Repository name
   * @param {string} tagName - Tag name for the release
   * @param {string} releaseName - Release name
   * @returns {Promise<Object>} Release data
   */
  async createRelease(repoName, tagName, releaseName = 'File Storage Release') {
    try {
      const { data } = await this.octokit.repos.createRelease({
        owner: this.username,
        repo: repoName,
        tag_name: tagName,
        name: releaseName,
        body: 'Automated release for file storage',
        draft: false,
        prerelease: false
      });

      return {
        id: data.id.toString(),
        tagName: data.tag_name,
        name: data.name,
        uploadUrl: data.upload_url,
        htmlUrl: data.html_url
      };
    } catch (error) {
      this.handleGitHubError(error, 'release creation');
    }
  }

  /**
   * Upload file as release asset
   * @param {string} uploadUrl - Release upload URL
   * @param {string} filename - File name
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} contentType - File content type
   * @returns {Promise<Object>} Asset data
   */
  async uploadReleaseAsset(uploadUrl, filename, fileBuffer, contentType) {
    try {
      // Remove the template part of the upload URL
      const cleanUploadUrl = uploadUrl.replace('{?name,label}', '');
      
      const { data } = await this.octokit.request({
        method: 'POST',
        url: cleanUploadUrl,
        headers: {
          'content-type': contentType,
        },
        data: fileBuffer,
        name: filename,
        label: filename
      });

      return {
        id: data.id.toString(),
        name: data.name,
        size: data.size,
        downloadUrl: data.browser_download_url,
        contentType: data.content_type,
        state: data.state
      };
    } catch (error) {
      this.handleGitHubError(error, 'asset upload');
    }
  }

  /**
   * Upload file with automatic release creation
   * @param {string} repoName - Repository name
   * @param {string} filename - File name
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} contentType - File content type
   * @returns {Promise<Object>} Complete upload result
   */
  async uploadFile(repoName, filename, fileBuffer, contentType) {
    try {
      // Create a unique tag for this upload
      const timestamp = Date.now();
      const randomId = Helpers.generateRandomString(8);
      const tagName = `upload-${timestamp}-${randomId}`;
      const releaseName = `File Upload ${new Date().toISOString()}`;

      // Create release
      const release = await this.createRelease(repoName, tagName, releaseName);

      // Upload file as asset
      const asset = await this.uploadReleaseAsset(
        release.uploadUrl,
        filename,
        fileBuffer,
        contentType
      );

      return {
        releaseId: release.id,
        assetId: asset.id,
        downloadUrl: asset.downloadUrl,
        filename: asset.name,
        size: asset.size,
        releaseUrl: release.htmlUrl
      };
    } catch (error) {
      this.handleGitHubError(error, 'file upload');
    }
  }

  /**
   * Delete a release asset
   * @param {string} assetId - Asset ID
   * @returns {Promise<void>}
   */
  async deleteReleaseAsset(assetId) {
    try {
      await this.octokit.repos.deleteReleaseAsset({
        owner: this.username,
        asset_id: parseInt(assetId)
      });

      console.log(`✅ Deleted asset: ${assetId}`);
    } catch (error) {
      // If asset is already deleted, don't throw error
      if (error.status === 404) {
        console.log(`ℹ️ Asset ${assetId} already deleted or not found`);
        return;
      }
      this.handleGitHubError(error, 'asset deletion');
    }
  }

  /**
   * Delete a release
   * @param {string} releaseId - Release ID
   * @returns {Promise<void>}
   */
  async deleteRelease(releaseId) {
    try {
      await this.octokit.repos.deleteRelease({
        owner: this.username,
        release_id: parseInt(releaseId)
      });

      console.log(`✅ Deleted release: ${releaseId}`);
    } catch (error) {
      // If release is already deleted, don't throw error
      if (error.status === 404) {
        console.log(`ℹ️ Release ${releaseId} already deleted or not found`);
        return;
      }
      this.handleGitHubError(error, 'release deletion');
    }
  }

  /**
   * Get repository size and release count
   * @param {string} repoName - Repository name
   * @returns {Promise<Object>} Repository statistics
   */
  async getRepositoryStats(repoName) {
    try {
      // Get repository info
      const repo = await this.getRepository(repoName);

      // Get releases
      const { data: releases } = await this.octokit.repos.listReleases({
        owner: this.username,
        repo: repoName,
        per_page: 100
      });

      // Calculate total asset size
      let totalAssetSize = 0;
      let totalAssets = 0;

      for (const release of releases) {
        const { data: assets } = await this.octokit.repos.listReleaseAssets({
          owner: this.username,
          release_id: release.id
        });

        totalAssets += assets.length;
        totalAssetSize += assets.reduce((sum, asset) => sum + asset.size, 0);
      }

      return {
        repoSize: repo.size, // Size in KB from GitHub API
        releaseCount: releases.length,
        assetCount: totalAssets,
        totalAssetSize, // Size in bytes
        totalAssetSizeMb: Helpers.bytesToMb(totalAssetSize)
      };
    } catch (error) {
      this.handleGitHubError(error, 'repository stats retrieval');
    }
  }

  /**
   * Get API rate limit status
   * @returns {Promise<Object>} Rate limit information
   */
  async getRateLimit() {
    try {
      const { data } = await this.octokit.rateLimit.get();
      
      return {
        core: {
          limit: data.resources.core.limit,
          remaining: data.resources.core.remaining,
          reset: new Date(data.resources.core.reset * 1000),
          used: data.resources.core.used
        },
        search: {
          limit: data.resources.search.limit,
          remaining: data.resources.search.remaining,
          reset: new Date(data.resources.search.reset * 1000),
          used: data.resources.search.used
        }
      };
    } catch (error) {
      this.handleGitHubError(error, 'rate limit check');
    }
  }

  /**
   * Check if we can perform operations based on rate limit
   * @returns {Promise<boolean>} True if operations can be performed
   */
  async canPerformOperations() {
    try {
      const rateLimit = await this.getRateLimit();
      return rateLimit.core.remaining > 10; // Keep some buffer
    } catch (error) {
      console.warn('Unable to check rate limit, proceeding with caution:', error.message);
      return true; // Assume we can proceed if we can't check
    }
  }
}

module.exports = new GitHubService();
