const githubService = require('./github');
const supabaseService = require('./supabase');
const repoManagerService = require('./repoManager');
const { AppError } = require('../middleware/errorHandler');
const { ERROR_CODES, MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES } = require('../utils/constants');
const Helpers = require('../utils/helpers');

/**
 * File Manager Service
 * Handles file upload, download, deletion, and management operations
 */
class FileManagerService {

  /**
   * Validate file before upload
   * @param {Object} file - File object from multer
   * @throws {AppError} If validation fails
   */
  validateFile(file) {
    if (!file) {
      throw new AppError(
        'No file provided',
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Please select a file to upload'
      );
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new AppError(
        'File too large',
        ERROR_CODES.FILE_TOO_LARGE,
        413,
        `Maximum file size is ${Helpers.formatBytes(MAX_FILE_SIZE_BYTES)}, received ${Helpers.formatBytes(file.size)}`
      );
    }

    // Check file type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new AppError(
        'Invalid file type',
        ERROR_CODES.INVALID_FILE_TYPE,
        400,
        `File type ${file.mimetype} is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.slice(0, 10).join(', ')}...`
      );
    }

    // Check filename
    if (!file.originalname || file.originalname.trim() === '') {
      throw new AppError(
        'Invalid filename',
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'File must have a valid name'
      );
    }

    // Check for malicious filenames
    const sanitizedName = Helpers.sanitizeFilename(file.originalname);
    if (sanitizedName.length === 0) {
      throw new AppError(
        'Invalid filename',
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Filename contains only invalid characters'
      );
    }
  }

  /**
   * Upload a file to GitHub storage
   * @param {Object} file - File object from multer
   * @param {string} userId - User ID
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result with file metadata
   */
  async uploadFile(file, userId, options = {}) {
    try {
      // Validate file
      this.validateFile(file);

      // Generate unique filename to avoid conflicts
      const uniqueFilename = Helpers.generateUniqueFilename(file.originalname);
      const fileSizeBytes = file.size;
      const fileSizeMb = Helpers.bytesToMb(fileSizeBytes);

      console.log(`📤 Starting upload: ${file.originalname} (${Helpers.formatBytes(fileSizeBytes)})`);

      // Get available repository
      const repository = await repoManagerService.getAvailableRepository(userId, fileSizeBytes);
      
      console.log(`📁 Using repository: ${repository.name}`);

      // Check if we should create a new repository instead
      if (repoManagerService.shouldRotateRepository(repository, fileSizeMb)) {
        console.log(`🔄 Repository rotation needed, creating new repository`);
        const newRepo = await repoManagerService.createNewRepository(
          userId, 
          (await supabaseService.getUserRepositories(userId)).length + 1
        );
        repository.id = newRepo.id;
        repository.name = newRepo.name;
      }

      // Upload file to GitHub
      console.log(`⬆️ Uploading to GitHub: ${uniqueFilename}`);
      const uploadResult = await githubService.uploadFile(
        repository.name,
        uniqueFilename,
        file.buffer,
        file.mimetype
      );

      // Store file metadata in database
      const fileData = {
        userId,
        repoId: repository.id,
        filename: uniqueFilename,
        originalName: file.originalname,
        sizeMb: fileSizeMb,
        mimeType: file.mimetype,
        downloadUrl: uploadResult.downloadUrl,
        ghReleaseId: uploadResult.releaseId,
        ghAssetId: uploadResult.assetId
      };

      console.log(`💾 Storing file metadata in database`);
      const dbFile = await supabaseService.createFile(fileData);

      // Update repository size
      await repoManagerService.updateRepositorySize(repository.id, fileSizeMb);

      console.log(`✅ Upload completed: ${file.originalname} → ${uniqueFilename}`);

      return {
        success: true,
        file: {
          id: dbFile.id,
          filename: dbFile.filename,
          originalName: dbFile.original_name,
          size: fileSizeBytes,
          sizeMb: fileSizeMb,
          sizeFormatted: Helpers.formatBytes(fileSizeBytes),
          mimeType: dbFile.mime_type,
          downloadUrl: dbFile.download_url,
          uploadedAt: dbFile.created_at,
          repository: repository.name
        },
        repository: {
          id: repository.id,
          name: repository.name,
          sizeAfterUpload: repository.size_mb + fileSizeMb
        }
      };

    } catch (error) {
      console.error('File upload error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'File upload failed',
        ERROR_CODES.FILE_UPLOAD_FAILED,
        500,
        error.message
      );
    }
  }

  /**
   * Upload multiple files
   * @param {Array} files - Array of file objects
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Batch upload results
   */
  async uploadMultipleFiles(files, userId) {
    if (!files || files.length === 0) {
      throw new AppError(
        'No files provided',
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Please select at least one file to upload'
      );
    }

    const results = {
      successful: [],
      failed: [],
      totalSize: 0,
      totalFiles: files.length
    };

    console.log(`📤 Starting batch upload of ${files.length} files`);

    // Process files sequentially to avoid overwhelming GitHub API
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        console.log(`📤 Processing file ${i + 1}/${files.length}: ${file.originalname}`);
        
        const uploadResult = await this.uploadFile(file, userId);
        results.successful.push(uploadResult.file);
        results.totalSize += file.size;
        
        // Add small delay between uploads to be respectful to GitHub API
        if (i < files.length - 1) {
          await Helpers.delay(500);
        }
        
      } catch (error) {
        console.error(`Failed to upload ${file.originalname}:`, error);
        results.failed.push({
          filename: file.originalname,
          error: error.message,
          code: error.code || ERROR_CODES.FILE_UPLOAD_FAILED
        });
      }
    }

    console.log(`📤 Batch upload completed: ${results.successful.length} successful, ${results.failed.length} failed`);

    return {
      success: results.failed.length === 0,
      summary: {
        totalFiles: results.totalFiles,
        successful: results.successful.length,
        failed: results.failed.length,
        totalSize: results.totalSize,
        totalSizeFormatted: Helpers.formatBytes(results.totalSize)
      },
      files: results.successful,
      errors: results.failed
    };
  }

  /**
   * Get file by ID
   * @param {string} fileId - File ID
   * @param {string} userId - User ID (for security)
   * @returns {Promise<Object>} File data
   */
  async getFile(fileId, userId) {
    try {
      const file = await supabaseService.getFileById(fileId, userId);
      
      if (!file) {
        throw new AppError(
          'File not found',
          ERROR_CODES.FILE_NOT_FOUND,
          404,
          'The requested file does not exist or you do not have access to it'
        );
      }

      return {
        id: file.id,
        filename: file.filename,
        originalName: file.original_name,
        size: file.size_mb * 1024 * 1024, // Convert back to bytes
        sizeMb: file.size_mb,
        sizeFormatted: Helpers.formatBytes(file.size_mb * 1024 * 1024),
        mimeType: file.mime_type,
        downloadUrl: file.download_url,
        uploadedAt: file.created_at,
        repository: {
          name: file.repos.name,
          githubId: file.repos.github_repo_id
        }
      };
    } catch (error) {
      console.error('Error getting file:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to retrieve file',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  }

  /**
   * Get user files with pagination
   * @param {string} userId - User ID
   * @param {Object} options - Query options (limit, offset, search)
   * @returns {Promise<Object>} Paginated file list
   */
  async getUserFiles(userId, options = {}) {
    try {
      const {
        limit = 20,
        offset = 0,
        search = ''
      } = options;

      const result = await supabaseService.getUserFiles(userId, limit, offset);
      
      // Format files for frontend
      const formattedFiles = result.files.map(file => ({
        id: file.id,
        filename: file.filename,
        originalName: file.original_name,
        size: file.size_mb * 1024 * 1024,
        sizeMb: file.size_mb,
        sizeFormatted: Helpers.formatBytes(file.size_mb * 1024 * 1024),
        mimeType: file.mime_type,
        downloadUrl: file.download_url,
        uploadedAt: file.created_at,
        repository: {
          name: file.repos.name,
          githubId: file.repos.github_repo_id
        }
      }));

      // Apply search filter if provided
      const filteredFiles = search 
        ? formattedFiles.filter(file => 
            file.originalName.toLowerCase().includes(search.toLowerCase()) ||
            file.filename.toLowerCase().includes(search.toLowerCase())
          )
        : formattedFiles;

      return {
        files: filteredFiles,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: (result.offset + result.limit) < result.total
        }
      };
    } catch (error) {
      console.error('Error getting user files:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to retrieve files',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  }

  /**
   * Delete a file
   * @param {string} fileId - File ID
   * @param {string} userId - User ID (for security)
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFile(fileId, userId) {
    try {
      // Get file details first
      const file = await this.getFile(fileId, userId);
      
      console.log(`🗑️ Deleting file: ${file.originalName} (${file.filename})`);

      // Delete from GitHub (release asset)
      try {
        const dbFile = await supabaseService.getFileById(fileId, userId);
        
        if (dbFile.gh_asset_id) {
          await githubService.deleteReleaseAsset(dbFile.gh_asset_id);
        }
        
        // Optionally delete the release if it has no more assets
        // This is commented out to avoid complications, but could be implemented
        // if (dbFile.gh_release_id) {
        //   await githubService.deleteRelease(dbFile.gh_release_id);
        // }
      } catch (githubError) {
        console.warn('GitHub deletion failed (continuing with database cleanup):', githubError.message);
        // Continue with database deletion even if GitHub deletion fails
      }

      // Delete from database
      const deletedFile = await supabaseService.deleteFile(fileId, userId);

      // Update repository size
      if (deletedFile.repo_id) {
        await repoManagerService.updateRepositorySize(deletedFile.repo_id, -deletedFile.size_mb);
      }

      console.log(`✅ File deleted: ${file.originalName}`);

      return {
        success: true,
        deletedFile: {
          id: deletedFile.id,
          filename: deletedFile.filename,
          originalName: deletedFile.original_name,
          size: deletedFile.size_mb * 1024 * 1024,
          sizeMb: deletedFile.size_mb
        }
      };

    } catch (error) {
      console.error('File deletion error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'File deletion failed',
        ERROR_CODES.FILE_DELETE_FAILED,
        500,
        error.message
      );
    }
  }

  /**
   * Delete multiple files
   * @param {Array} fileIds - Array of file IDs
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Batch deletion results
   */
  async deleteMultipleFiles(fileIds, userId) {
    if (!fileIds || fileIds.length === 0) {
      throw new AppError(
        'No files specified',
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Please specify at least one file to delete'
      );
    }

    const results = {
      successful: [],
      failed: [],
      totalSize: 0,
      totalFiles: fileIds.length
    };

    console.log(`🗑️ Starting batch deletion of ${fileIds.length} files`);

    // Process deletions sequentially
    for (let i = 0; i < fileIds.length; i++) {
      const fileId = fileIds[i];
      
      try {
        const deleteResult = await this.deleteFile(fileId, userId);
        results.successful.push(deleteResult.deletedFile);
        results.totalSize += deleteResult.deletedFile.size;
        
      } catch (error) {
        console.error(`Failed to delete file ${fileId}:`, error);
        results.failed.push({
          fileId,
          error: error.message,
          code: error.code || ERROR_CODES.FILE_DELETE_FAILED
        });
      }
    }

    console.log(`🗑️ Batch deletion completed: ${results.successful.length} successful, ${results.failed.length} failed`);

    return {
      success: results.failed.length === 0,
      summary: {
        totalFiles: results.totalFiles,
        successful: results.successful.length,
        failed: results.failed.length,
        totalSize: results.totalSize,
        totalSizeFormatted: Helpers.formatBytes(results.totalSize)
      },
      deletedFiles: results.successful,
      errors: results.failed
    };
  }

  /**
   * Get file statistics for a user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} File statistics
   */
  async getFileStatistics(userId) {
    try {
      const { files } = await this.getUserFiles(userId, { limit: 1000 }); // Get all files
      
      // Calculate statistics
      const stats = {
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + file.size, 0),
        totalSizeMb: files.reduce((sum, file) => sum + file.sizeMb, 0),
        averageFileSize: files.length > 0 ? files.reduce((sum, file) => sum + file.size, 0) / files.length : 0,
        largestFile: files.length > 0 ? Math.max(...files.map(f => f.size)) : 0,
        smallestFile: files.length > 0 ? Math.min(...files.map(f => f.size)) : 0,
        fileTypes: {},
        uploadsByMonth: {}
      };

      // Count file types
      files.forEach(file => {
        const extension = Helpers.getFileExtension(file.filename);
        stats.fileTypes[extension] = (stats.fileTypes[extension] || 0) + 1;
      });

      // Count uploads by month
      files.forEach(file => {
        const month = new Date(file.uploadedAt).toISOString().substring(0, 7); // YYYY-MM
        stats.uploadsByMonth[month] = (stats.uploadsByMonth[month] || 0) + 1;
      });

      // Format for display
      stats.totalSizeFormatted = Helpers.formatBytes(stats.totalSize);
      stats.averageFileSizeFormatted = Helpers.formatBytes(stats.averageFileSize);
      stats.largestFileFormatted = Helpers.formatBytes(stats.largestFile);
      stats.smallestFileFormatted = Helpers.formatBytes(stats.smallestFile);

      return stats;
    } catch (error) {
      console.error('Error getting file statistics:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to retrieve file statistics',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  }
}

module.exports = new FileManagerService();
