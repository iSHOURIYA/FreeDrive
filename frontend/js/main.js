// FreeDrive Main JavaScript
class FreeDriveApp {
  constructor() {
    this.API_BASE = '/api';
    this.token = localStorage.getItem('freedrive_token');
    this.user = null;
    
    this.init();
  }

  async init() {
    // Initialize the app
    this.setupGlobalErrorHandling();
    this.setupLoadingIndicator();
    
    // Check authentication status
    if (this.token) {
      try {
        await this.validateToken();
      } catch (error) {
        console.error('Token validation failed:', error);
        this.logout();
      }
    }
    
    // Set up page-specific functionality
    this.setupPageFunctionality();
  }

  setupGlobalErrorHandling() {
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.showToast('An unexpected error occurred', 'error');
    });

    window.addEventListener('error', (event) => {
      console.error('Global error:', event.error);
      this.showToast('An unexpected error occurred', 'error');
    });
  }

  setupLoadingIndicator() {
    // Create loading spinner element
    const spinner = document.createElement('div');
    spinner.id = 'global-loading';
    spinner.className = 'loading-spinner hidden';
    spinner.innerHTML = `
      <div class="spinner"></div>
      <p>Loading...</p>
    `;
    document.body.appendChild(spinner);
  }

  setupPageFunctionality() {
    const path = window.location.pathname;
    
    if (path === '/' || path === '/index.html') {
      this.setupLandingPage();
    } else if (path === '/dashboard.html' || path.includes('dashboard')) {
      this.setupDashboard();
    }
  }

  // Authentication Methods
  async validateToken() {
    const response = await this.makeRequest('/auth/validate', {
      method: 'GET'
    });
    
    if (response.success) {
      this.user = response.data.user;
      return true;
    } else {
      throw new Error('Invalid token');
    }
  }

  async login(email, password) {
    this.showLoading('Signing in...');
    
    try {
      const response = await this.makeRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      
      if (response.success) {
        this.token = response.data.token;
        this.user = response.data.user;
        localStorage.setItem('freedrive_token', this.token);
        
        this.showToast('Welcome back!', 'success');
        window.location.href = '/dashboard.html';
        return true;
      } else {
        throw new Error(response.error || 'Login failed');
      }
    } catch (error) {
      this.showToast(error.message, 'error');
      return false;
    } finally {
      this.hideLoading();
    }
  }

  async register(email, password, fullName) {
    this.showLoading('Creating account...');
    
    try {
      const response = await this.makeRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, fullName })
      });
      
      if (response.success) {
        this.token = response.data.token;
        this.user = response.data.user;
        localStorage.setItem('freedrive_token', this.token);
        
        this.showToast('Welcome to FreeDrive!', 'success');
        window.location.href = '/dashboard.html';
        return true;
      } else {
        throw new Error(response.error || 'Registration failed');
      }
    } catch (error) {
      this.showToast(error.message, 'error');
      return false;
    } finally {
      this.hideLoading();
    }
  }

  async forgotPassword(email) {
    this.showLoading('Sending reset link...');
    
    try {
      const response = await this.makeRequest('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      
      if (response.success) {
        this.showToast('Password reset link sent to your email', 'success');
        return true;
      } else {
        throw new Error(response.error || 'Failed to send reset link');
      }
    } catch (error) {
      this.showToast(error.message, 'error');
      return false;
    } finally {
      this.hideLoading();
    }
  }

  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('freedrive_token');
    window.location.href = '/';
  }

  // API Request Helper
  async makeRequest(endpoint, options = {}) {
    const url = `${this.API_BASE}${endpoint}`;
    
    const defaultHeaders = {
      'Content-Type': 'application/json'
    };
    
    if (this.token) {
      defaultHeaders['Authorization'] = `Bearer ${this.token}`;
    }
    
    const config = {
      headers: defaultHeaders,
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    };
    
    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (response.status === 401) {
        this.logout();
        throw new Error('Session expired. Please log in again.');
      }
      
      return data;
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Network error. Please check your connection.');
      }
      throw error;
    }
  }

  // UI Helper Methods
  showLoading(message = 'Loading...') {
    const loadingEl = document.getElementById('global-loading');
    if (loadingEl) {
      loadingEl.querySelector('p').textContent = message;
      loadingEl.classList.remove('hidden');
    }
  }

  hideLoading() {
    const loadingEl = document.getElementById('global-loading');
    if (loadingEl) {
      loadingEl.classList.add('hidden');
    }
  }

  showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <p>${message}</p>
      </div>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 5000);
    
    // Remove on click
    toast.addEventListener('click', () => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    });
  }

  setupLandingPage() {
    // Set up authentication modals
    this.setupAuthModals();
    
    // Set up CTA buttons
    this.setupCTAButtons();
    
    // Check if user is already logged in
    if (this.token && this.user) {
      // Update UI for logged-in user
      this.updateNavForLoggedInUser();
    }
  }

  setupAuthModals() {
    // Login Modal
    const loginModal = document.getElementById('loginModal');
    const loginBtn = document.getElementById('loginBtn');
    const showRegisterLink = document.getElementById('showRegister');
    const loginForm = document.getElementById('loginForm');
    
    if (loginBtn && loginModal) {
      loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.showModal(loginModal);
      });
    }
    
    if (showRegisterLink) {
      showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.hideModal(loginModal);
        this.showModal(document.getElementById('registerModal'));
      });
    }
    
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(loginForm);
        const email = formData.get('email');
        const password = formData.get('password');
        
        const success = await this.login(email, password);
        if (success) {
          this.hideModal(loginModal);
        }
      });
    }
    
    // Register Modal
    const registerModal = document.getElementById('registerModal');
    const registerBtn = document.getElementById('registerBtn');
    const showLoginLink = document.getElementById('showLogin');
    const registerForm = document.getElementById('registerForm');
    
    if (registerBtn && registerModal) {
      registerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.showModal(registerModal);
      });
    }
    
    if (showLoginLink) {
      showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.hideModal(registerModal);
        this.showModal(loginModal);
      });
    }
    
    if (registerForm) {
      registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(registerForm);
        const email = formData.get('email');
        const password = formData.get('password');
        const confirmPassword = formData.get('confirmPassword');
        const fullName = formData.get('fullName');
        
        if (password !== confirmPassword) {
          this.showToast('Passwords do not match', 'error');
          return;
        }
        
        const success = await this.register(email, password, fullName);
        if (success) {
          this.hideModal(registerModal);
        }
      });
    }
    
    // Forgot Password Modal
    const forgotModal = document.getElementById('forgotModal');
    const showForgotLink = document.getElementById('showForgot');
    const forgotForm = document.getElementById('forgotForm');
    
    if (showForgotLink && forgotModal) {
      showForgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.hideModal(loginModal);
        this.showModal(forgotModal);
      });
    }
    
    if (forgotForm) {
      forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(forgotForm);
        const email = formData.get('email');
        
        const success = await this.forgotPassword(email);
        if (success) {
          this.hideModal(forgotModal);
        }
      });
    }
    
    // Close modal functionality
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.hideModal(e.target);
      }
      
      if (e.target.classList.contains('modal-close')) {
        const modal = e.target.closest('.modal');
        if (modal) {
          this.hideModal(modal);
        }
      }
    });
    
    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal:not(.hidden)');
        if (openModal) {
          this.hideModal(openModal);
        }
      }
    });
  }

  setupCTAButtons() {
    const ctaButtons = document.querySelectorAll('[data-action="signup"]');
    ctaButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const registerModal = document.getElementById('registerModal');
        if (registerModal) {
          this.showModal(registerModal);
        }
      });
    });
  }

  updateNavForLoggedInUser() {
    const authButtons = document.querySelector('.nav-buttons');
    if (authButtons && this.user) {
      authButtons.innerHTML = `
        <span class="nav-welcome">Welcome, ${this.user.fullName || this.user.email}</span>
        <a href="/dashboard.html" class="btn btn-primary">Dashboard</a>
        <button onclick="app.logout()" class="btn btn-outline">Logout</button>
      `;
    }
  }

  showModal(modal) {
    if (modal) {
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  hideModal(modal) {
    if (modal) {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  setupDashboard() {
    // This will be handled by dashboard.js
    // But we can set up some common functionality here
    
    // Check if user is logged in
    if (!this.token || !this.user) {
      window.location.href = '/';
      return;
    }
    
    // Update user info in header
    this.updateDashboardHeader();
    
    // Set up logout functionality
    this.setupLogoutButton();
  }

  updateDashboardHeader() {
    const userNameEl = document.getElementById('userName');
    const userEmailEl = document.getElementById('userEmail');
    
    if (userNameEl && this.user) {
      userNameEl.textContent = this.user.fullName || this.user.email;
    }
    
    if (userEmailEl && this.user) {
      userEmailEl.textContent = this.user.email;
    }
  }

  setupLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.logout();
      });
    }
  }

  // Utility Methods
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  getFileIcon(fileName, isFolder = false) {
    if (isFolder) {
      return '📁';
    }
    
    const extension = fileName.split('.').pop().toLowerCase();
    
    const iconMap = {
      // Images
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'png': '🖼️',
      'gif': '🖼️',
      'svg': '🖼️',
      'webp': '🖼️',
      
      // Documents
      'pdf': '📄',
      'doc': '📝',
      'docx': '📝',
      'txt': '📝',
      'rtf': '📝',
      
      // Spreadsheets
      'xls': '📊',
      'xlsx': '📊',
      'csv': '📊',
      
      // Presentations
      'ppt': '📊',
      'pptx': '📊',
      
      // Code
      'js': '📜',
      'html': '📜',
      'css': '📜',
      'json': '📜',
      'xml': '📜',
      'py': '📜',
      'java': '📜',
      'cpp': '📜',
      'c': '📜',
      
      // Archives
      'zip': '📦',
      'rar': '📦',
      '7z': '📦',
      'tar': '📦',
      'gz': '📦',
      
      // Audio
      'mp3': '🎵',
      'wav': '🎵',
      'flac': '🎵',
      'aac': '🎵',
      
      // Video
      'mp4': '🎬',
      'avi': '🎬',
      'mkv': '🎬',
      'mov': '🎬',
      'wmv': '🎬',
    };
    
    return iconMap[extension] || '📄';
  }
}

// Password strength checker
function checkPasswordStrength(password) {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  };
  
  const score = Object.values(requirements).filter(Boolean).length;
  
  return {
    requirements,
    score,
    strength: score < 3 ? 'weak' : score < 4 ? 'medium' : 'strong'
  };
}

// Initialize the app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new FreeDriveApp();
  
  // Set up password strength indicator if present
  const passwordInput = document.getElementById('password');
  const passwordRequirements = document.querySelector('.password-requirements');
  
  if (passwordInput && passwordRequirements) {
    passwordInput.addEventListener('input', (e) => {
      const password = e.target.value;
      const { requirements } = checkPasswordStrength(password);
      
      const requirementItems = passwordRequirements.querySelectorAll('li');
      requirementItems.forEach((item, index) => {
        const requirement = Object.values(requirements)[index];
        item.className = requirement ? 'valid' : 'invalid';
      });
    });
  }
});

// Export for use in other scripts
window.FreeDriveApp = FreeDriveApp;
