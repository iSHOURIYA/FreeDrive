# FreeDrive MVP

A GitHub-powered file storage platform that leverages GitHub repositories and releases for secure, scalable file storage.

## 🚀 Features

- **GitHub-Powered Storage**: Uses GitHub repositories and releases for file storage
- **Secure Authentication**: JWT-based authentication with Supabase
- **File Management**: Upload, download, delete, rename, and share files
- **Repository Management**: Automatic repository creation and rotation
- **Storage Analytics**: Track usage, storage limits, and file statistics
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Real-time Updates**: Live file browser with drag-and-drop upload

## 🏗️ Architecture

### Backend
- **Framework**: Node.js with Express
- **Database**: PostgreSQL via Supabase
- **File Storage**: GitHub Repositories + GitHub Releases
- **Authentication**: JWT tokens with Supabase Auth
- **API**: RESTful API with comprehensive error handling

### Frontend
- **Technology**: Vanilla HTML/CSS/JavaScript
- **Design**: Responsive, modern UI with CSS Grid/Flexbox
- **Architecture**: Modular JavaScript with class-based components
- **Features**: Drag-and-drop uploads, modal dialogs, toast notifications

## 📋 Prerequisites

- Node.js 18+ and npm
- GitHub account and Personal Access Token
- Supabase account and project
- Git

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd freedrive-mvp
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file in the backend directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# GitHub Configuration
GITHUB_TOKEN=your_github_personal_access_token
GITHUB_USERNAME=your_github_username

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# App Configuration
APP_NAME=FreeDrive
APP_URL=http://localhost:3001
```

### 3. Database Setup

1. Create a new Supabase project
2. Run the database schema:

```bash
# Copy the contents of database_schema.sql and run it in your Supabase SQL editor
```

3. Set up Row Level Security (RLS) policies as defined in the schema

### 4. Frontend Setup

```bash
cd ../frontend
npm install
```

### 5. GitHub Setup

1. Create a GitHub Personal Access Token with these permissions:
   - `repo` (Full control of private repositories)
   - `delete_repo` (Delete repositories)
   - `user:email` (Access user email addresses)

2. Update your GitHub username in the backend `.env` file

## 🚀 Running the Application

### Development Mode

1. Start the backend server:
```bash
cd backend
npm run dev
```

2. Start the frontend server:
```bash
cd frontend
npm start
```

3. Open your browser and navigate to `http://localhost:3001`

### Production Mode

1. Build and start the backend:
```bash
cd backend
npm start
```

2. Serve the frontend:
```bash
cd frontend
npm run build
# Deploy the built files to your web server
```

## 📁 Project Structure

```
freedrive-mvp/
├── backend/
│   ├── server.js                 # Main server file
│   ├── routes/                   # API route handlers
│   │   ├── auth.js              # Authentication routes
│   │   ├── files.js             # File management routes
│   │   ├── repos.js             # Repository management routes
│   │   └── users.js             # User management routes
│   ├── services/                # Business logic services
│   │   ├── supabase.js         # Database operations
│   │   ├── github.js           # GitHub API integration
│   │   ├── repoManager.js      # Repository lifecycle management
│   │   └── fileManager.js      # File operations
│   ├── middleware/              # Express middleware
│   │   ├── auth.js             # Authentication middleware
│   │   ├── upload.js           # File upload middleware
│   │   └── errorHandler.js     # Error handling middleware
│   ├── utils/                   # Utility functions
│   ├── database_schema.sql      # Database schema and setup
│   └── package.json
├── frontend/
│   ├── index.html              # Landing page
│   ├── dashboard.html          # Main application interface
│   ├── css/                    # Stylesheets
│   │   ├── main.css           # Global styles and utilities
│   │   ├── auth.css           # Authentication and landing page styles
│   │   └── dashboard.css      # Dashboard-specific styles
│   ├── js/                     # JavaScript modules
│   │   ├── main.js            # Core app functionality and API client
│   │   └── dashboard.js       # Dashboard-specific functionality
│   └── package.json
├── design.md                   # Design specifications
├── requirements.md             # Project requirements
├── tasks.md                   # Development tasks
└── README.md                  # This file
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/validate` - Validate JWT token
- `POST /api/auth/forgot-password` - Password reset

### File Management
- `GET /api/files` - List files and folders
- `POST /api/files/upload` - Upload files
- `GET /api/files/:id/download` - Download file
- `PUT /api/files/:id` - Update file (rename)
- `DELETE /api/files/:id` - Delete file
- `POST /api/files/:id/share` - Generate share link

### Repository Management
- `GET /api/repos` - List user repositories
- `POST /api/repos` - Create new repository
- `DELETE /api/repos/:id` - Delete repository

### User Management
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/stats` - Get storage statistics

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: API rate limiting to prevent abuse
- **Input Validation**: Comprehensive input validation with Joi
- **CORS Configuration**: Properly configured CORS policies
- **Helmet Security**: Security headers with Helmet.js
- **File Validation**: File type and size validation
- **Row Level Security**: Database-level security with Supabase RLS

## 🎨 UI Features

- **Responsive Design**: Mobile-first responsive design
- **Dark Mode Ready**: CSS custom properties for easy theming
- **Drag & Drop**: Intuitive file upload interface
- **Modal Dialogs**: Clean authentication and action modals
- **Toast Notifications**: User feedback for all actions
- **Loading States**: Loading indicators for better UX
- **File Icons**: Visual file type identification
- **Grid/List Views**: Multiple file browser views

## 📊 Storage Management

- **Repository Rotation**: Automatic repository creation when limits are reached
- **Storage Analytics**: Real-time storage usage tracking
- **File Organization**: Hierarchical folder structure
- **Batch Operations**: Multiple file uploads and operations
- **Storage Limits**: Configurable storage quotas per user

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Your Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `GITHUB_TOKEN` | GitHub Personal Access Token | Yes |
| `GITHUB_USERNAME` | Your GitHub username | Yes |
| `JWT_SECRET` | Secret key for JWT tokens | Yes |
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | Environment (development/production) | No |

### GitHub Repository Settings

The application automatically creates repositories with the naming pattern:
- `freedrive-storage-1`
- `freedrive-storage-2`
- etc.

Each repository can store up to 1GB of files using GitHub releases.

## 🚀 Deployment

### Backend Deployment (Heroku)

1. Create a new Heroku app
2. Set environment variables in Heroku dashboard
3. Deploy:

```bash
git subtree push --prefix backend heroku main
```

### Frontend Deployment (Netlify/Vercel)

1. Build the frontend:
```bash
cd frontend
npm run build
```

2. Deploy the `dist` folder to your hosting provider

### Database Migration

Run the database schema in your production Supabase instance:

```sql
-- Copy and execute the contents of database_schema.sql
```

## 📝 Development

### Adding New Features

1. **Backend**: Add routes in `routes/`, business logic in `services/`
2. **Frontend**: Add JavaScript in `js/`, styles in `css/`
3. **Database**: Update schema and add migrations

### Testing

```bash
# Backend tests
cd backend
npm test

# Frontend testing (manual)
cd frontend
npm start
```

### Code Style

- Use ESLint and Prettier for code formatting
- Follow existing code patterns and conventions
- Add comments for complex business logic

## 🐛 Troubleshooting

### Common Issues

1. **GitHub API Rate Limits**: Ensure you're using a Personal Access Token
2. **CORS Errors**: Check that frontend URL is in CORS whitelist
3. **Database Errors**: Verify Supabase credentials and RLS policies
4. **File Upload Failures**: Check GitHub token permissions

### Debug Mode

Set `NODE_ENV=development` for detailed error logging.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section above
- Review the API documentation

---

**FreeDrive MVP** - Leverage GitHub's infrastructure for your file storage needs! 🚀
