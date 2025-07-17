const crypto = require('crypto');

/**
 * Utility functions for the FreeDrive application
 */
class Helpers {
  /**
   * Generate a unique filename to avoid conflicts
   * @param {string} originalName - Original filename
   * @returns {string} - Unique filename
   */
  static generateUniqueFilename(originalName) {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(8).toString('hex');
    const extension = originalName.split('.').pop();
    const baseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_');
    
    return `${baseName}_${timestamp}_${randomBytes}.${extension}`;
  }

  /**
   * Generate repository name for a user
   * @param {string} userId - User ID
   * @param {number} bucketNumber - Bucket number (1, 2, 3, etc.)
   * @returns {string} - Repository name
   */
  static generateRepoName(userId, bucketNumber = 1) {
    // Clean userId to make it safe for repository names
    const cleanUserId = userId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
    return `user_${cleanUserId}_bucket_${bucketNumber}`;
  }

  /**
   * Convert bytes to human-readable format
   * @param {number} bytes - Number of bytes
   * @param {number} decimals - Number of decimal places
   * @returns {string} - Human-readable size
   */
  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Convert MB to bytes
   * @param {number} mb - Megabytes
   * @returns {number} - Bytes
   */
  static mbToBytes(mb) {
    return mb * 1024 * 1024;
  }

  /**
   * Convert bytes to MB
   * @param {number} bytes - Bytes
   * @returns {number} - Megabytes
   */
  static bytesToMb(bytes) {
    return bytes / (1024 * 1024);
  }

  /**
   * Validate email format
   * @param {string} email - Email address
   * @returns {boolean} - True if valid
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Generate a random string
   * @param {number} length - Length of the string
   * @returns {string} - Random string
   */
  static generateRandomString(length = 32) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  /**
   * Sanitize filename for safe storage
   * @param {string} filename - Original filename
   * @returns {string} - Sanitized filename
   */
  static sanitizeFilename(filename) {
    // Remove or replace unsafe characters
    return filename
      .replace(/[<>:"/\\|?*]/g, '_') // Replace unsafe characters with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .substring(0, 255); // Limit length
  }

  /**
   * Validate file type against allowed types
   * @param {string} mimeType - File MIME type
   * @param {string[]} allowedTypes - Array of allowed MIME types
   * @returns {boolean} - True if valid
   */
  static isValidFileType(mimeType, allowedTypes) {
    return allowedTypes.includes(mimeType);
  }

  /**
   * Create delay for retry logic
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after delay
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Exponential backoff delay calculation
   * @param {number} attempt - Current attempt number (0-based)
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {number} - Delay in milliseconds
   */
  static exponentialBackoff(attempt, baseDelay = 1000) {
    return baseDelay * Math.pow(2, attempt);
  }

  /**
   * Retry function with exponential backoff
   * @param {Function} fn - Function to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {Promise} - Promise that resolves with function result
   */
  static async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          throw error;
        }

        const delayMs = this.exponentialBackoff(attempt, baseDelay);
        await this.delay(delayMs);
      }
    }

    throw lastError;
  }

  /**
   * Extract file extension from filename
   * @param {string} filename - Filename
   * @returns {string} - File extension (without dot)
   */
  static getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
  }

  /**
   * Check if a value is empty (null, undefined, empty string, empty array, empty object)
   * @param {*} value - Value to check
   * @returns {boolean} - True if empty
   */
  static isEmpty(value) {
    if (value === null || value === undefined || value === '') {
      return true;
    }
    
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    
    if (typeof value === 'object') {
      return Object.keys(value).length === 0;
    }
    
    return false;
  }

  /**
   * Create a standardized API response
   * @param {boolean} success - Success status
   * @param {*} data - Response data
   * @param {string} message - Response message
   * @param {string} code - Error/success code
   * @returns {object} - Standardized response
   */
  static createResponse(success, data = null, message = '', code = '') {
    const response = {
      success,
      timestamp: new Date().toISOString()
    };

    if (data !== null) {
      response.data = data;
    }

    if (message) {
      response.message = message;
    }

    if (code) {
      response.code = code;
    }

    return response;
  }
}

module.exports = Helpers;
