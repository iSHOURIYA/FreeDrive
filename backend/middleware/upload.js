const multer = require('multer');
const { AppError } = require('./errorHandler');
const { ERROR_CODES, MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES } = require('../utils/constants');
const Helpers = require('../utils/helpers');

/**
 * Configure multer for file uploads
 */

// Memory storage - files will be stored in memory as Buffer
const storage = multer.memoryStorage();

/**
 * File filter function to validate uploaded files
 * @param {Object} req - Express request object
 * @param {Object} file - Multer file object
 * @param {Function} cb - Callback function
 */
const fileFilter = (req, file, cb) => {
  try {
    // Check file type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      const error = new AppError(
        'Invalid file type',
        ERROR_CODES.INVALID_FILE_TYPE,
        400,
        `File type ${file.mimetype} is not allowed. Allowed types: ${ALLOWED_MIME_TYPES.slice(0, 10).join(', ')}...`
      );
      return cb(error, false);
    }

    // Check filename
    if (!file.originalname || file.originalname.trim() === '') {
      const error = new AppError(
        'Invalid filename',
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'File must have a valid name'
      );
      return cb(error, false);
    }

    // Sanitize filename
    const sanitizedName = Helpers.sanitizeFilename(file.originalname);
    if (sanitizedName.length === 0) {
      const error = new AppError(
        'Invalid filename',
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Filename contains only invalid characters'
      );
      return cb(error, false);
    }

    // Update the original name with sanitized version
    file.originalname = sanitizedName;

    cb(null, true);
  } catch (error) {
    cb(error, false);
  }
};

/**
 * Basic multer configuration for single file upload
 */
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
    fieldSize: 100 * 1024, // 100KB for other fields
    fieldNameSize: 100, // 100 characters for field names
    fields: 10 // Maximum 10 non-file fields
  }
});

/**
 * Multer configuration for multiple file uploads
 */
const uploadMultiple = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 10, // Maximum 10 files at once
    fieldSize: 100 * 1024,
    fieldNameSize: 100,
    fields: 10
  }
});

/**
 * Middleware for handling single file upload
 * @param {string} fieldName - Form field name for the file
 */
const singleFileUpload = (fieldName = 'file') => {
  return (req, res, next) => {
    const uploadSingle = upload.single(fieldName);
    
    uploadSingle(req, res, (error) => {
      if (error) {
        console.error('Single file upload error:', error);
        
        // Handle multer-specific errors
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError(
              'File too large',
              ERROR_CODES.FILE_TOO_LARGE,
              413,
              `Maximum file size is ${Helpers.formatBytes(MAX_FILE_SIZE_BYTES)}`
            ));
          }
          
          if (error.code === 'LIMIT_FILE_COUNT') {
            return next(new AppError(
              'Too many files',
              ERROR_CODES.VALIDATION_ERROR,
              400,
              'Only one file is allowed for this endpoint'
            ));
          }
          
          if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(new AppError(
              'Unexpected file field',
              ERROR_CODES.VALIDATION_ERROR,
              400,
              `Expected file field name: ${fieldName}`
            ));
          }
          
          return next(new AppError(
            'File upload error',
            ERROR_CODES.FILE_UPLOAD_FAILED,
            400,
            error.message
          ));
        }
        
        // Handle custom validation errors
        if (error instanceof AppError) {
          return next(error);
        }
        
        // Handle other errors
        return next(new AppError(
          'File upload failed',
          ERROR_CODES.FILE_UPLOAD_FAILED,
          500,
          error.message
        ));
      }
      
      // Validate that file was actually uploaded
      if (!req.file) {
        return next(new AppError(
          'No file uploaded',
          ERROR_CODES.VALIDATION_ERROR,
          400,
          'Please select a file to upload'
        ));
      }
      
      next();
    });
  };
};

/**
 * Middleware for handling multiple file uploads
 * @param {string} fieldName - Form field name for the files
 * @param {number} maxFiles - Maximum number of files allowed
 */
const multipleFileUpload = (fieldName = 'files', maxFiles = 10) => {
  return (req, res, next) => {
    // Update the limits for this specific call
    const uploadMultipleConfig = multer({
      storage: storage,
      fileFilter: fileFilter,
      limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
        files: maxFiles,
        fieldSize: 100 * 1024,
        fieldNameSize: 100,
        fields: 10
      }
    });
    
    const uploadArray = uploadMultipleConfig.array(fieldName, maxFiles);
    
    uploadArray(req, res, (error) => {
      if (error) {
        console.error('Multiple file upload error:', error);
        
        // Handle multer-specific errors
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError(
              'File too large',
              ERROR_CODES.FILE_TOO_LARGE,
              413,
              `One or more files exceed the maximum size of ${Helpers.formatBytes(MAX_FILE_SIZE_BYTES)}`
            ));
          }
          
          if (error.code === 'LIMIT_FILE_COUNT') {
            return next(new AppError(
              'Too many files',
              ERROR_CODES.VALIDATION_ERROR,
              400,
              `Maximum ${maxFiles} files allowed`
            ));
          }
          
          if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(new AppError(
              'Unexpected file field',
              ERROR_CODES.VALIDATION_ERROR,
              400,
              `Expected file field name: ${fieldName}`
            ));
          }
          
          return next(new AppError(
            'File upload error',
            ERROR_CODES.FILE_UPLOAD_FAILED,
            400,
            error.message
          ));
        }
        
        // Handle custom validation errors
        if (error instanceof AppError) {
          return next(error);
        }
        
        // Handle other errors
        return next(new AppError(
          'File upload failed',
          ERROR_CODES.FILE_UPLOAD_FAILED,
          500,
          error.message
        ));
      }
      
      // Validate that files were actually uploaded
      if (!req.files || req.files.length === 0) {
        return next(new AppError(
          'No files uploaded',
          ERROR_CODES.VALIDATION_ERROR,
          400,
          'Please select at least one file to upload'
        ));
      }
      
      next();
    });
  };
};

/**
 * Middleware for handling file fields (both single and multiple)
 * @param {Array} fields - Array of field configurations
 */
const fileFieldsUpload = (fields) => {
  return (req, res, next) => {
    const uploadFields = upload.fields(fields);
    
    uploadFields(req, res, (error) => {
      if (error) {
        console.error('File fields upload error:', error);
        
        // Handle multer-specific errors
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError(
              'File too large',
              ERROR_CODES.FILE_TOO_LARGE,
              413,
              `One or more files exceed the maximum size of ${Helpers.formatBytes(MAX_FILE_SIZE_BYTES)}`
            ));
          }
          
          return next(new AppError(
            'File upload error',
            ERROR_CODES.FILE_UPLOAD_FAILED,
            400,
            error.message
          ));
        }
        
        // Handle custom validation errors
        if (error instanceof AppError) {
          return next(error);
        }
        
        // Handle other errors
        return next(new AppError(
          'File upload failed',
          ERROR_CODES.FILE_UPLOAD_FAILED,
          500,
          error.message
        ));
      }
      
      next();
    });
  };
};

/**
 * Middleware to validate file upload requirements
 * Can be used before actual upload to check quotas, permissions, etc.
 */
const validateUploadRequirements = async (req, res, next) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      throw new AppError(
        'Authentication required',
        ERROR_CODES.AUTH_REQUIRED,
        401,
        'Please log in to upload files'
      );
    }

    // Here you could add additional validation:
    // - Check user storage quota
    // - Check file upload permissions
    // - Validate business rules
    
    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    
    console.error('Upload validation error:', error);
    next(new AppError(
      'Upload validation failed',
      ERROR_CODES.VALIDATION_ERROR,
      500,
      error.message
    ));
  }
};

/**
 * Middleware to log file upload attempts
 */
const logUploadAttempt = (req, res, next) => {
  const userInfo = req.user ? `User: ${req.user.email}` : 'Anonymous';
  const timestamp = new Date().toISOString();
  
  console.log(`📤 Upload attempt: ${userInfo} at ${timestamp}`);
  
  // You could also log to a file or external service here
  
  next();
};

module.exports = {
  upload,
  uploadMultiple,
  singleFileUpload,
  multipleFileUpload,
  fileFieldsUpload,
  validateUploadRequirements,
  logUploadAttempt
};
