const { createClient } = require('@supabase/supabase-js');
const { AppError } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/constants');

/**
 * Supabase service for database operations
 */
class SupabaseService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    this.supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!this.supabaseUrl || !this.supabaseAnonKey) {
      throw new Error('Supabase configuration is missing. Please check SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
    }

    // Client for user operations (with RLS)
    this.client = createClient(this.supabaseUrl, this.supabaseAnonKey);
    
    // Admin client for service operations (bypasses RLS)
    this.adminClient = this.supabaseServiceKey 
      ? createClient(this.supabaseUrl, this.supabaseServiceKey)
      : this.client;
  }

  /**
   * Handle Supabase errors and convert to AppError
   * @param {Object} error - Supabase error object
   * @param {string} operation - Operation being performed
   * @throws {AppError}
   */
  handleError(error, operation) {
    console.error(`Supabase ${operation} error:`, error);
    
    if (error.code === 'PGRST116') {
      throw new AppError(
        'Record not found',
        ERROR_CODES.DATABASE_ERROR,
        404,
        `No record found for ${operation}`
      );
    }
    
    if (error.code === '23505') {
      throw new AppError(
        'Duplicate record',
        ERROR_CODES.DATABASE_ERROR,
        409,
        'A record with this data already exists'
      );
    }
    
    throw new AppError(
      `Database ${operation} failed`,
      ERROR_CODES.DATABASE_ERROR,
      500,
      error.message
    );
  }

  /**
   * Create a new user record (called after Supabase Auth signup)
   * @param {Object} userData - User data
   * @returns {Promise<Object>} User record
   */
  async createUser(userData) {
    try {
      const { data, error } = await this.adminClient
        .from('users')
        .insert({
          id: userData.id,
          email: userData.email,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) this.handleError(error, 'user creation');
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'user creation');
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User record
   */
  async getUserById(userId) {
    try {
      const { data, error } = await this.client
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) this.handleError(error, 'user retrieval');
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'user retrieval');
    }
  }

  /**
   * Create a new repository record
   * @param {Object} repoData - Repository data
   * @returns {Promise<Object>} Repository record
   */
  async createRepository(repoData) {
    try {
      const { data, error } = await this.client
        .from('repos')
        .insert({
          user_id: repoData.userId,
          name: repoData.name,
          github_repo_id: repoData.githubRepoId,
          size_mb: 0,
          max_size_mb: repoData.maxSizeMb || 800,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) this.handleError(error, 'repository creation');
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'repository creation');
    }
  }

  /**
   * Get user repositories
   * @param {string} userId - User ID
   * @param {boolean} activeOnly - Return only active repositories
   * @returns {Promise<Array>} Repository records
   */
  async getUserRepositories(userId, activeOnly = false) {
    try {
      let query = this.client
        .from('repos')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;

      if (error) this.handleError(error, 'repository retrieval');
      return data || [];
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'repository retrieval');
    }
  }

  /**
   * Get active repository with available space
   * @param {string} userId - User ID
   * @param {number} requiredSpaceMb - Required space in MB
   * @returns {Promise<Object|null>} Repository record or null if no space available
   */
  async getAvailableRepository(userId, requiredSpaceMb) {
    try {
      const { data, error } = await this.client
        .from('repos')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) this.handleError(error, 'available repository retrieval');

      // Find repository with enough space
      const availableRepo = data?.find(repo => 
        (repo.size_mb + requiredSpaceMb) <= repo.max_size_mb
      );

      return availableRepo || null;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'available repository retrieval');
    }
  }

  /**
   * Update repository size
   * @param {string} repoId - Repository ID
   * @param {number} sizeMb - New size in MB
   * @returns {Promise<Object>} Updated repository record
   */
  async updateRepositorySize(repoId, sizeMb) {
    try {
      const { data, error } = await this.client
        .from('repos')
        .update({
          size_mb: sizeMb,
          updated_at: new Date().toISOString()
        })
        .eq('id', repoId)
        .select()
        .single();

      if (error) this.handleError(error, 'repository size update');
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'repository size update');
    }
  }

  /**
   * Create a new file record
   * @param {Object} fileData - File data
   * @returns {Promise<Object>} File record
   */
  async createFile(fileData) {
    try {
      const { data, error } = await this.client
        .from('files')
        .insert({
          user_id: fileData.userId,
          repo_id: fileData.repoId,
          filename: fileData.filename,
          original_name: fileData.originalName,
          size_mb: fileData.sizeMb,
          mime_type: fileData.mimeType,
          download_url: fileData.downloadUrl,
          gh_release_id: fileData.ghReleaseId,
          gh_asset_id: fileData.ghAssetId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) this.handleError(error, 'file creation');
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'file creation');
    }
  }

  /**
   * Get user files
   * @param {string} userId - User ID
   * @param {number} limit - Number of files to return
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Object>} Files data with pagination info
   */
  async getUserFiles(userId, limit = 50, offset = 0) {
    try {
      // Get files with repository information
      const { data, error, count } = await this.client
        .from('files')
        .select(`
          *,
          repos!inner(name, github_repo_id)
        `, { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) this.handleError(error, 'user files retrieval');

      return {
        files: data || [],
        total: count || 0,
        limit,
        offset
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'user files retrieval');
    }
  }

  /**
   * Get file by ID
   * @param {string} fileId - File ID
   * @param {string} userId - User ID (for security)
   * @returns {Promise<Object>} File record
   */
  async getFileById(fileId, userId) {
    try {
      const { data, error } = await this.client
        .from('files')
        .select(`
          *,
          repos!inner(name, github_repo_id)
        `)
        .eq('id', fileId)
        .eq('user_id', userId)
        .single();

      if (error) this.handleError(error, 'file retrieval');
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'file retrieval');
    }
  }

  /**
   * Delete file record
   * @param {string} fileId - File ID
   * @param {string} userId - User ID (for security)
   * @returns {Promise<Object>} Deleted file record
   */
  async deleteFile(fileId, userId) {
    try {
      const { data, error } = await this.client
        .from('files')
        .delete()
        .eq('id', fileId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) this.handleError(error, 'file deletion');
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'file deletion');
    }
  }

  /**
   * Get user storage statistics
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Storage statistics
   */
  async getUserStorageStats(userId) {
    try {
      // Get total files and size
      const { data: filesData, error: filesError } = await this.client
        .from('files')
        .select('size_mb')
        .eq('user_id', userId);

      if (filesError) this.handleError(filesError, 'storage stats retrieval');

      // Get repository count
      const { count: repoCount, error: repoError } = await this.client
        .from('repos')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (repoError) this.handleError(repoError, 'repository count retrieval');

      const totalFiles = filesData?.length || 0;
      const totalSizeMb = filesData?.reduce((sum, file) => sum + (file.size_mb || 0), 0) || 0;
      const totalRepositories = repoCount || 0;
      
      // Calculate available storage (assuming 50GB total across multiple repos)
      const maxStorageGb = totalRepositories * 0.8; // 800MB per repo
      const usedStorageGb = totalSizeMb / 1024;
      const availableStorageGb = Math.max(0, maxStorageGb - usedStorageGb);

      return {
        totalFiles,
        totalSizeMb,
        totalSizeBytes: totalSizeMb * 1024 * 1024,
        totalRepositories,
        usedStorageGb,
        availableStorageGb,
        maxStorageGb,
        usagePercentage: maxStorageGb > 0 ? (usedStorageGb / maxStorageGb) * 100 : 0
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.handleError(error, 'storage stats retrieval');
    }
  }
}

module.exports = new SupabaseService();
