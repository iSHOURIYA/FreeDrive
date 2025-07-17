const express = require('express');
const fileManagerService = require('../services/fileManager');
const { authMiddleware, validateOwnership, userRateLimitMiddleware } = require('../middleware/auth');
const { singleFileUpload, multipleFileUpload, validateUploadRequirements, logUploadAttempt } = require('../middleware/upload');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { ERROR_CODES } = require('../utils/constants');
const Helpers = require('../utils/helpers');

const router = express.Router();

// Apply authentication to all file routes
router.use(authMiddleware);

// Apply user-specific rate limiting
const fileUploadRateLimit = userRateLimitMiddleware(50, 60 * 1000); // 50 uploads per minute
const fileOperationRateLimit = userRateLimitMiddleware(200, 60 * 1000); // 200 operations per minute

/**
 * Upload a single file
 * POST /api/files/upload
 */
router.post('/upload', 
  fileUploadRateLimit,
  validateUploadRequirements,
  logUploadAttempt,
  singleFileUpload('file'),
  asyncHandler(async (req, res) => {
    try {
      const uploadResult = await fileManagerService.uploadFile(req.file, req.user.id);

      const response = Helpers.createResponse(
        true,
        uploadResult,
        'File uploaded successfully',
        'FILE_UPLOAD_SUCCESS'
      );

      res.status(201).json(response);

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
  })
);

/**
 * Upload multiple files
 * POST /api/files/upload-multiple
 */
router.post('/upload-multiple',
  fileUploadRateLimit,
  validateUploadRequirements,
  logUploadAttempt,
  multipleFileUpload('files', 10), // Maximum 10 files
  asyncHandler(async (req, res) => {
    try {
      const uploadResult = await fileManagerService.uploadMultipleFiles(req.files, req.user.id);

      const response = Helpers.createResponse(
        uploadResult.success,
        uploadResult,
        uploadResult.success ? 'Files uploaded successfully' : 'Some files failed to upload',
        uploadResult.success ? 'BATCH_UPLOAD_SUCCESS' : 'BATCH_UPLOAD_PARTIAL'
      );

      res.status(uploadResult.success ? 201 : 207).json(response); // 207 for partial success

    } catch (error) {
      console.error('Multiple file upload error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Batch file upload failed',
        ERROR_CODES.FILE_UPLOAD_FAILED,
        500,
        error.message
      );
    }
  })
);

/**
 * Get user files with pagination and search
 * GET /api/files
 */
router.get('/',
  fileOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const {
        limit = 20,
        offset = 0,
        search = '',
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      // Validate parameters
      const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 100); // Max 100 files per request
      const offsetNum = Math.max(parseInt(offset) || 0, 0);

      const options = {
        limit: limitNum,
        offset: offsetNum,
        search: search.trim(),
        sortBy,
        sortOrder
      };

      const result = await fileManagerService.getUserFiles(req.user.id, options);

      const response = Helpers.createResponse(
        true,
        result,
        'Files retrieved successfully',
        'FILES_RETRIEVED'
      );

      res.json(response);

    } catch (error) {
      console.error('File retrieval error:', error);
      
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
  })
);

/**
 * Get file by ID
 * GET /api/files/:id
 */
router.get('/:id',
  fileOperationRateLimit,
  validateOwnership('id'),
  asyncHandler(async (req, res) => {
    try {
      const file = await fileManagerService.getFile(req.params.id, req.user.id);

      const response = Helpers.createResponse(
        true,
        { file },
        'File retrieved successfully',
        'FILE_RETRIEVED'
      );

      res.json(response);

    } catch (error) {
      console.error('Single file retrieval error:', error);
      
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
  })
);

/**
 * Get file download URL (redirect to GitHub)
 * GET /api/files/:id/download
 */
router.get('/:id/download',
  fileOperationRateLimit,
  validateOwnership('id'),
  asyncHandler(async (req, res) => {
    try {
      const file = await fileManagerService.getFile(req.params.id, req.user.id);

      // Check if we should redirect or return URL
      const returnUrl = req.query.url === 'true';

      if (returnUrl) {
        const response = Helpers.createResponse(
          true,
          {
            downloadUrl: file.downloadUrl,
            filename: file.originalName,
            size: file.size,
            sizeFormatted: file.sizeFormatted
          },
          'Download URL retrieved successfully',
          'DOWNLOAD_URL_RETRIEVED'
        );

        res.json(response);
      } else {
        // Redirect to GitHub download URL
        res.redirect(302, file.downloadUrl);
      }

    } catch (error) {
      console.error('File download error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to initiate download',
        ERROR_CODES.FILE_NOT_FOUND,
        500,
        error.message
      );
    }
  })
);

/**
 * Delete a file
 * DELETE /api/files/:id
 */
router.delete('/:id',
  fileOperationRateLimit,
  validateOwnership('id'),
  asyncHandler(async (req, res) => {
    try {
      const deleteResult = await fileManagerService.deleteFile(req.params.id, req.user.id);

      const response = Helpers.createResponse(
        true,
        deleteResult,
        'File deleted successfully',
        'FILE_DELETED'
      );

      res.json(response);

    } catch (error) {
      console.error('File deletion error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Failed to delete file',
        ERROR_CODES.FILE_DELETE_FAILED,
        500,
        error.message
      );
    }
  })
);

/**
 * Delete multiple files
 * DELETE /api/files/batch
 */
router.delete('/batch',
  fileOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const { fileIds } = req.body;

      if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
        throw new AppError(
          'File IDs required',
          ERROR_CODES.VALIDATION_ERROR,
          400,
          'Please provide an array of file IDs to delete'
        );
      }

      if (fileIds.length > 50) {
        throw new AppError(
          'Too many files',
          ERROR_CODES.VALIDATION_ERROR,
          400,
          'Maximum 50 files can be deleted at once'
        );
      }

      const deleteResult = await fileManagerService.deleteMultipleFiles(fileIds, req.user.id);

      const response = Helpers.createResponse(
        deleteResult.success,
        deleteResult,
        deleteResult.success ? 'Files deleted successfully' : 'Some files failed to delete',
        deleteResult.success ? 'BATCH_DELETE_SUCCESS' : 'BATCH_DELETE_PARTIAL'
      );

      res.status(deleteResult.success ? 200 : 207).json(response);

    } catch (error) {
      console.error('Batch file deletion error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Batch file deletion failed',
        ERROR_CODES.FILE_DELETE_FAILED,
        500,
        error.message
      );
    }
  })
);

/**
 * Get file statistics for the user
 * GET /api/files/stats
 */
router.get('/stats/summary',
  fileOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const stats = await fileManagerService.getFileStatistics(req.user.id);

      const response = Helpers.createResponse(
        true,
        { statistics: stats },
        'File statistics retrieved successfully',
        'FILE_STATS_RETRIEVED'
      );

      res.json(response);

    } catch (error) {
      console.error('File statistics error:', error);
      
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
  })
);

/**
 * Search files
 * POST /api/files/search
 */
router.post('/search',
  fileOperationRateLimit,
  asyncHandler(async (req, res) => {
    try {
      const {
        query = '',
        fileTypes = [],
        sizeRange = {},
        dateRange = {},
        limit = 20,
        offset = 0
      } = req.body;

      // Validate search parameters
      if (!query.trim() && fileTypes.length === 0 && Object.keys(sizeRange).length === 0 && Object.keys(dateRange).length === 0) {
        throw new AppError(
          'Search criteria required',
          ERROR_CODES.VALIDATION_ERROR,
          400,
          'Please provide at least one search criteria'
        );
      }

      // For now, use simple search functionality
      // In a full implementation, you might want more sophisticated search
      const searchOptions = {
        search: query.trim(),
        limit: Math.min(Math.max(parseInt(limit) || 20, 1), 100),
        offset: Math.max(parseInt(offset) || 0, 0)
      };

      const result = await fileManagerService.getUserFiles(req.user.id, searchOptions);

      // Apply additional filters if needed
      let filteredFiles = result.files;

      if (fileTypes.length > 0) {
        filteredFiles = filteredFiles.filter(file => {
          const extension = Helpers.getFileExtension(file.filename);
          return fileTypes.includes(extension);
        });
      }

      if (sizeRange.min !== undefined || sizeRange.max !== undefined) {
        filteredFiles = filteredFiles.filter(file => {
          if (sizeRange.min !== undefined && file.size < sizeRange.min) return false;
          if (sizeRange.max !== undefined && file.size > sizeRange.max) return false;
          return true;
        });
      }

      const response = Helpers.createResponse(
        true,
        {
          files: filteredFiles,
          searchQuery: query,
          totalResults: filteredFiles.length,
          pagination: result.pagination
        },
        'Search completed successfully',
        'SEARCH_SUCCESS'
      );

      res.json(response);

    } catch (error) {
      console.error('File search error:', error);
      
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        'Search failed',
        ERROR_CODES.DATABASE_ERROR,
        500,
        error.message
      );
    }
  })
);

module.exports = router;
