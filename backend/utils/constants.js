// Application constants
module.exports = {
  // Storage limits
  MAX_FILE_SIZE_BYTES: (parseInt(process.env.MAX_FILE_SIZE_MB) || 2048) * 1024 * 1024, // 2GB default
  MAX_REPO_SIZE_BYTES: (parseInt(process.env.MAX_REPO_SIZE_MB) || 800) * 1024 * 1024, // 800MB default
  MAX_FILES_PER_REPO: parseInt(process.env.FILES_PER_REPO) || 1000,

  // Repository naming
  REPO_PREFIX: 'user',
  REPO_SUFFIX: 'bucket',
  
  // GitHub limits
  GITHUB_RELEASE_ASSET_LIMIT: 2 * 1024 * 1024 * 1024, // 2GB per file
  GITHUB_REPO_SIZE_LIMIT: 800 * 1024 * 1024, // 800MB per repo
  
  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  
  // File types
  ALLOWED_MIME_TYPES: [
    // Images
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    // Documents
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Text
    'text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript',
    // Archives
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    // Video
    'video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov',
    // Audio
    'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
    // Other
    'application/json', 'application/xml'
  ],
  
  // Error codes
  ERROR_CODES: {
    // Authentication
    AUTH_REQUIRED: 'AUTH_REQUIRED',
    AUTH_INVALID: 'AUTH_INVALID',
    AUTH_EXPIRED: 'AUTH_EXPIRED',
    
    // File operations
    FILE_TOO_LARGE: 'FILE_TOO_LARGE',
    FILE_NOT_FOUND: 'FILE_NOT_FOUND',
    FILE_UPLOAD_FAILED: 'FILE_UPLOAD_FAILED',
    FILE_DELETE_FAILED: 'FILE_DELETE_FAILED',
    INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
    
    // Repository operations
    REPO_CREATE_FAILED: 'REPO_CREATE_FAILED',
    REPO_NOT_FOUND: 'REPO_NOT_FOUND',
    REPO_FULL: 'REPO_FULL',
    
    // GitHub API
    GITHUB_API_ERROR: 'GITHUB_API_ERROR',
    GITHUB_RATE_LIMIT: 'GITHUB_RATE_LIMIT',
    GITHUB_UNAUTHORIZED: 'GITHUB_UNAUTHORIZED',
    
    // Database
    DATABASE_ERROR: 'DATABASE_ERROR',
    DATABASE_CONNECTION_ERROR: 'DATABASE_CONNECTION_ERROR',
    
    // General
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED'
  }
};
