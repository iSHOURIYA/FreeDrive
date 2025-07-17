// FreeDrive Dashboard JavaScript
class DashboardManager {
  constructor(app) {
    this.app = app;
    this.currentPath = '/';
    this.currentView = 'list'; // 'list' or 'grid'
    this.files = [];
    this.filteredFiles = [];
    this.repositories = [];
    this.uploadQueue = [];
    
    this.init();
  }

  async init() {
    // Set up dashboard functionality
    this.setupSidebar();
    this.setupFileUpload();
    this.setupFileManager();
    this.setupSearch();
    this.setupViewToggle();
    
    // Load initial data
    await this.loadDashboardData();
    
    // Set up periodic refresh
    this.setupPeriodicRefresh();
  }

  async loadDashboardData() {
    this.app.showLoading('Loading dashboard...');
    
    try {
      await Promise.all([
        this.loadFiles(),
        this.loadRepositories(),
        this.loadStorageStats()
      ]);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      this.app.showToast('Failed to load dashboard data', 'error');
    } finally {
      this.app.hideLoading();
    }
  }

  setupSidebar() {
    // Set up navigation
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Update active state
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        // Show corresponding section
        const section = link.getAttribute('data-section');
        this.showSection(section);
      });
    });
    
    // Set default active section
    this.showSection('files');
  }

  showSection(sectionName) {
    // Hide all sections
    const sections = document.querySelectorAll('.dashboard-section');
    sections.forEach(section => section.classList.add('hidden'));
    
    // Show selected section
    const targetSection = document.getElementById(`${sectionName}Section`);
    if (targetSection) {
      targetSection.classList.remove('hidden');
    }
    
    // Load section-specific data
    switch (sectionName) {
      case 'files':
        this.loadFiles();
        break;
      case 'repositories':
        this.loadRepositories();
        break;
      case 'settings':
        this.loadSettings();
        break;
    }
  }

  setupFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => {
        fileInput.click();
      });
    }
    
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        this.handleFileUpload(files);
      });
    }
    
    if (uploadArea) {
      // Drag and drop functionality
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
      });
      
      uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
      });
      
      uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files);
        this.handleFileUpload(files);
      });
      
      uploadArea.addEventListener('click', () => {
        if (fileInput) {
          fileInput.click();
        }
      });
    }
  }

  async handleFileUpload(files) {
    if (files.length === 0) return;
    
    // Add files to upload queue
    const uploadItems = files.map(file => ({
      id: Date.now() + Math.random(),
      file,
      progress: 0,
      status: 'pending',
      error: null
    }));
    
    this.uploadQueue.push(...uploadItems);
    this.updateUploadProgress();
    
    // Process uploads
    for (const item of uploadItems) {
      try {
        await this.uploadFile(item);
      } catch (error) {
        item.status = 'error';
        item.error = error.message;
        this.updateUploadProgress();
      }
    }
    
    // Refresh file list
    await this.loadFiles();
  }

  async uploadFile(uploadItem) {
    const { file } = uploadItem;
    
    uploadItem.status = 'uploading';
    this.updateUploadProgress();
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', this.currentPath);
    
    try {
      const response = await fetch(`${this.app.API_BASE}/files/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.app.token}`
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (data.success) {
        uploadItem.status = 'completed';
        uploadItem.progress = 100;
        this.app.showToast(`${file.name} uploaded successfully`, 'success');
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error) {
      uploadItem.status = 'error';
      uploadItem.error = error.message;
      this.app.showToast(`Failed to upload ${file.name}: ${error.message}`, 'error');
    }
    
    this.updateUploadProgress();
  }

  updateUploadProgress() {
    const progressContainer = document.getElementById('uploadProgress');
    if (!progressContainer) return;
    
    if (this.uploadQueue.length === 0) {
      progressContainer.innerHTML = '';
      return;
    }
    
    const html = this.uploadQueue.map(item => `
      <div class="upload-progress-item">
        <div class="upload-progress-info">
          <div class="upload-progress-name">${item.file.name}</div>
          <div class="upload-progress-bar">
            <div class="upload-progress-fill" style="width: ${item.progress}%"></div>
          </div>
          <div class="upload-progress-status">
            ${item.status === 'completed' ? 'Completed' : 
              item.status === 'error' ? `Error: ${item.error}` : 
              item.status === 'uploading' ? 'Uploading...' : 'Pending'}
          </div>
        </div>
      </div>
    `).join('');
    
    progressContainer.innerHTML = html;
    
    // Clear completed items after a delay
    setTimeout(() => {
      this.uploadQueue = this.uploadQueue.filter(item => 
        item.status !== 'completed' && item.status !== 'error'
      );
      if (this.uploadQueue.length === 0) {
        progressContainer.innerHTML = '';
      }
    }, 3000);
  }

  setupFileManager() {
    // Set up file list interactions
    this.setupFileContextMenu();
    this.setupBreadcrumb();
  }

  setupFileContextMenu() {
    // This would set up right-click context menus for files
    // For now, we'll handle clicks on action buttons
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('file-action')) {
        const action = e.target.dataset.action;
        const fileId = e.target.dataset.fileId;
        
        this.handleFileAction(action, fileId);
      }
    });
  }

  async handleFileAction(action, fileId) {
    const file = this.files.find(f => f.id === fileId);
    if (!file) return;
    
    switch (action) {
      case 'download':
        await this.downloadFile(file);
        break;
      case 'delete':
        await this.deleteFile(file);
        break;
      case 'rename':
        await this.renameFile(file);
        break;
      case 'share':
        await this.shareFile(file);
        break;
    }
  }

  async downloadFile(file) {
    try {
      this.app.showLoading('Preparing download...');
      
      const response = await this.app.makeRequest(`/files/${file.id}/download`);
      
      if (response.success) {
        // Create download link
        const link = document.createElement('a');
        link.href = response.data.downloadUrl;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.app.showToast('Download started', 'success');
      } else {
        throw new Error(response.error || 'Download failed');
      }
    } catch (error) {
      this.app.showToast(`Download failed: ${error.message}`, 'error');
    } finally {
      this.app.hideLoading();
    }
  }

  async deleteFile(file) {
    if (!confirm(`Are you sure you want to delete ${file.name}?`)) {
      return;
    }
    
    try {
      this.app.showLoading('Deleting file...');
      
      const response = await this.app.makeRequest(`/files/${file.id}`, {
        method: 'DELETE'
      });
      
      if (response.success) {
        this.app.showToast(`${file.name} deleted successfully`, 'success');
        await this.loadFiles();
      } else {
        throw new Error(response.error || 'Delete failed');
      }
    } catch (error) {
      this.app.showToast(`Delete failed: ${error.message}`, 'error');
    } finally {
      this.app.hideLoading();
    }
  }

  async renameFile(file) {
    const newName = prompt('Enter new name:', file.name);
    if (!newName || newName === file.name) {
      return;
    }
    
    try {
      this.app.showLoading('Renaming file...');
      
      const response = await this.app.makeRequest(`/files/${file.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: newName })
      });
      
      if (response.success) {
        this.app.showToast(`File renamed to ${newName}`, 'success');
        await this.loadFiles();
      } else {
        throw new Error(response.error || 'Rename failed');
      }
    } catch (error) {
      this.app.showToast(`Rename failed: ${error.message}`, 'error');
    } finally {
      this.app.hideLoading();
    }
  }

  async shareFile(file) {
    try {
      const response = await this.app.makeRequest(`/files/${file.id}/share`, {
        method: 'POST'
      });
      
      if (response.success) {
        const shareUrl = response.data.shareUrl;
        
        // Copy to clipboard
        await navigator.clipboard.writeText(shareUrl);
        this.app.showToast('Share link copied to clipboard', 'success');
      } else {
        throw new Error(response.error || 'Share failed');
      }
    } catch (error) {
      this.app.showToast(`Share failed: ${error.message}`, 'error');
    }
  }

  setupSearch() {
    const searchInput = document.getElementById('fileSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        this.filterFiles(query);
      });
    }
  }

  filterFiles(query) {
    if (!query) {
      this.filteredFiles = [...this.files];
    } else {
      this.filteredFiles = this.files.filter(file =>
        file.name.toLowerCase().includes(query)
      );
    }
    
    this.renderFiles();
  }

  setupViewToggle() {
    const viewButtons = document.querySelectorAll('.view-toggle button');
    viewButtons.forEach(button => {
      button.addEventListener('click', () => {
        const view = button.dataset.view;
        
        // Update active state
        viewButtons.forEach(b => b.classList.remove('active'));
        button.classList.add('active');
        
        // Switch view
        this.currentView = view;
        this.renderFiles();
      });
    });
  }

  setupBreadcrumb() {
    // Handle breadcrumb navigation
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('breadcrumb-item')) {
        const path = e.target.dataset.path;
        this.navigateToPath(path);
      }
    });
  }

  navigateToPath(path) {
    this.currentPath = path;
    this.loadFiles();
    this.updateBreadcrumb();
  }

  updateBreadcrumb() {
    const breadcrumb = document.querySelector('.breadcrumb');
    if (!breadcrumb) return;
    
    const pathParts = this.currentPath.split('/').filter(part => part);
    
    let html = '<a href="#" class="breadcrumb-item" data-path="/">Home</a>';
    
    let currentPath = '';
    pathParts.forEach(part => {
      currentPath += '/' + part;
      html += ` <span class="breadcrumb-separator">/</span> <a href="#" class="breadcrumb-item" data-path="${currentPath}">${part}</a>`;
    });
    
    breadcrumb.innerHTML = html;
  }

  async loadFiles() {
    try {
      const response = await this.app.makeRequest(`/files?path=${encodeURIComponent(this.currentPath)}`);
      
      if (response.success) {
        this.files = response.data.files || [];
        this.filteredFiles = [...this.files];
        this.renderFiles();
        this.updateBreadcrumb();
      } else {
        throw new Error(response.error || 'Failed to load files');
      }
    } catch (error) {
      console.error('Failed to load files:', error);
      this.app.showToast('Failed to load files', 'error');
    }
  }

  renderFiles() {
    const container = this.currentView === 'list' ? 
      document.getElementById('fileList') : 
      document.getElementById('fileGrid');
    
    if (!container) return;
    
    if (this.filteredFiles.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📁</div>
          <h3>No files found</h3>
          <p>Upload some files to get started.</p>
        </div>
      `;
      return;
    }
    
    if (this.currentView === 'list') {
      this.renderFileList(container);
    } else {
      this.renderFileGrid(container);
    }
  }

  renderFileList(container) {
    const html = `
      <div class="file-list-header">
        <div>Name</div>
        <div>Size</div>
        <div>Modified</div>
        <div>Actions</div>
      </div>
      ${this.filteredFiles.map(file => `
        <div class="file-item" data-file-id="${file.id}">
          <div class="file-info">
            <span class="file-icon">${this.app.getFileIcon(file.name, file.type === 'folder')}</span>
            <span class="file-name">${file.name}</span>
          </div>
          <div class="file-size">${this.app.formatFileSize(file.size || 0)}</div>
          <div class="file-date">${this.app.formatDate(file.updated_at)}</div>
          <div class="file-actions">
            <button class="file-action" data-action="download" data-file-id="${file.id}" title="Download">⬇️</button>
            <button class="file-action" data-action="share" data-file-id="${file.id}" title="Share">🔗</button>
            <button class="file-action" data-action="rename" data-file-id="${file.id}" title="Rename">✏️</button>
            <button class="file-action danger" data-action="delete" data-file-id="${file.id}" title="Delete">🗑️</button>
          </div>
        </div>
      `).join('')}
    `;
    
    container.innerHTML = html;
  }

  renderFileGrid(container) {
    const html = this.filteredFiles.map(file => `
      <div class="file-card" data-file-id="${file.id}">
        <div class="file-card-icon">${this.app.getFileIcon(file.name, file.type === 'folder')}</div>
        <div class="file-card-name">${file.name}</div>
        <div class="file-card-meta">
          ${this.app.formatFileSize(file.size || 0)} • ${this.app.formatDate(file.updated_at)}
        </div>
        <div class="file-card-actions">
          <button class="file-action btn btn-small btn-outline" data-action="download" data-file-id="${file.id}">Download</button>
          <button class="file-action btn btn-small btn-outline" data-action="share" data-file-id="${file.id}">Share</button>
        </div>
      </div>
    `).join('');
    
    container.innerHTML = html;
  }

  async loadRepositories() {
    try {
      const response = await this.app.makeRequest('/repos');
      
      if (response.success) {
        this.repositories = response.data.repositories || [];
        this.renderRepositories();
      } else {
        throw new Error(response.error || 'Failed to load repositories');
      }
    } catch (error) {
      console.error('Failed to load repositories:', error);
      this.app.showToast('Failed to load repositories', 'error');
    }
  }

  renderRepositories() {
    const container = document.getElementById('repositoryList');
    if (!container) return;
    
    if (this.repositories.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <h3>No repositories</h3>
          <p>Repositories will be created automatically as you upload files.</p>
        </div>
      `;
      return;
    }
    
    const html = this.repositories.map(repo => `
      <div class="repo-item">
        <div class="repo-info">
          <div class="repo-name">${repo.name}</div>
          <div class="repo-stats">
            <div class="repo-stat">
              <span>📁</span>
              <span>${repo.file_count || 0} files</span>
            </div>
            <div class="repo-stat">
              <span>💾</span>
              <span>${this.app.formatFileSize(repo.total_size || 0)}</span>
            </div>
            <div class="repo-stat">
              <span>📅</span>
              <span>Created ${this.app.formatDate(repo.created_at)}</span>
            </div>
          </div>
        </div>
        <div class="repo-actions">
          <button class="btn btn-small btn-outline" onclick="window.open('${repo.github_url}', '_blank')">
            View on GitHub
          </button>
        </div>
      </div>
    `).join('');
    
    container.innerHTML = html;
  }

  async loadStorageStats() {
    try {
      const response = await this.app.makeRequest('/users/stats');
      
      if (response.success) {
        const stats = response.data.stats;
        this.updateStorageInfo(stats);
        this.updateStatsCards(stats);
      } else {
        throw new Error(response.error || 'Failed to load stats');
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  updateStorageInfo(stats) {
    const usageEl = document.getElementById('storageUsage');
    const totalEl = document.getElementById('storageTotal');
    const barEl = document.querySelector('.storage-fill');
    
    if (usageEl) {
      usageEl.textContent = this.app.formatFileSize(stats.storage_used || 0);
    }
    
    if (totalEl) {
      totalEl.textContent = this.app.formatFileSize(stats.storage_limit || 1073741824); // 1GB default
    }
    
    if (barEl) {
      const percentage = ((stats.storage_used || 0) / (stats.storage_limit || 1073741824)) * 100;
      barEl.style.width = `${Math.min(percentage, 100)}%`;
    }
  }

  updateStatsCards(stats) {
    const elements = {
      totalFiles: document.getElementById('totalFiles'),
      totalSize: document.getElementById('totalSize'),
      repositoryCount: document.getElementById('repositoryCount'),
      recentUploads: document.getElementById('recentUploads')
    };
    
    if (elements.totalFiles) {
      elements.totalFiles.textContent = stats.total_files || 0;
    }
    
    if (elements.totalSize) {
      elements.totalSize.textContent = this.app.formatFileSize(stats.storage_used || 0);
    }
    
    if (elements.repositoryCount) {
      elements.repositoryCount.textContent = stats.repository_count || 0;
    }
    
    if (elements.recentUploads) {
      elements.recentUploads.textContent = stats.recent_uploads || 0;
    }
  }

  async loadSettings() {
    // Load user settings and preferences
    try {
      const response = await this.app.makeRequest('/users/profile');
      
      if (response.success) {
        const user = response.data.user;
        this.populateSettingsForm(user);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  populateSettingsForm(user) {
    const form = document.getElementById('settingsForm');
    if (!form) return;
    
    const inputs = {
      fullName: form.querySelector('[name="fullName"]'),
      email: form.querySelector('[name="email"]'),
      githubUsername: form.querySelector('[name="githubUsername"]')
    };
    
    if (inputs.fullName) inputs.fullName.value = user.full_name || '';
    if (inputs.email) inputs.email.value = user.email || '';
    if (inputs.githubUsername) inputs.githubUsername.value = user.github_username || '';
    
    // Set up form submission
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveSettings(new FormData(form));
    });
  }

  async saveSettings(formData) {
    try {
      this.app.showLoading('Saving settings...');
      
      const data = {
        fullName: formData.get('fullName'),
        githubUsername: formData.get('githubUsername')
      };
      
      const response = await this.app.makeRequest('/users/profile', {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      
      if (response.success) {
        this.app.showToast('Settings saved successfully', 'success');
        this.app.user = response.data.user;
        this.app.updateDashboardHeader();
      } else {
        throw new Error(response.error || 'Failed to save settings');
      }
    } catch (error) {
      this.app.showToast(`Failed to save settings: ${error.message}`, 'error');
    } finally {
      this.app.hideLoading();
    }
  }

  setupPeriodicRefresh() {
    // Refresh data every 5 minutes
    setInterval(() => {
      this.loadStorageStats();
    }, 5 * 60 * 1000);
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Wait for main app to be ready
  if (window.app) {
    window.dashboard = new DashboardManager(window.app);
  } else {
    // Wait for app to be initialized
    const checkApp = setInterval(() => {
      if (window.app) {
        window.dashboard = new DashboardManager(window.app);
        clearInterval(checkApp);
      }
    }, 100);
  }
});

// Export for use in other scripts
window.DashboardManager = DashboardManager;
