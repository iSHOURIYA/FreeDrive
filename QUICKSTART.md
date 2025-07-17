# FreeDrive MVP - Quick Start Guide

Get FreeDrive up and running in 5 minutes! 🚀

## 📦 What You'll Need

- Node.js 18+ and npm
- GitHub account
- Supabase account (free tier works)

## 🚀 Quick Setup

### 1. Clone and Install
```bash
git clone <your-repo-url>
cd freedrive-mvp
./deploy.sh
# Choose option 3 (Full setup)
```

### 2. Configure Environment
Edit `backend/.env` with your credentials:

```bash
# Your Supabase project URL and keys
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# GitHub Personal Access Token and username
GITHUB_TOKEN=ghp_your_token_here
GITHUB_USERNAME=your_username

# Any secure random string for JWT
JWT_SECRET=any_long_random_string_here
```

### 3. Setup Database
1. Go to your Supabase project
2. Open SQL Editor
3. Copy and run the entire `backend/database_schema.sql` file

### 4. Start the Application
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend  
cd frontend
npm start
```

### 5. Open in Browser
Navigate to `http://localhost:3001`

## 🔑 Getting Your Credentials

### Supabase Setup
1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Go to Settings → API
4. Copy Project URL and API keys

### GitHub Token Setup
1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Generate new token (classic)
3. Select these scopes:
   - ✅ repo (Full control of private repositories)
   - ✅ delete_repo (Delete repositories)
   - ✅ user:email (Access user email addresses)
4. Copy the token

## 🎯 Test Your Setup

1. **Register**: Create a new account at `http://localhost:3001`
2. **Upload**: Drag and drop a file to upload
3. **Browse**: Check your GitHub account for new repositories
4. **Download**: Click download on your uploaded file

## 🐛 Common Issues

### "CORS Error"
- Make sure frontend is running on port 3001
- Check that backend is running on port 3000

### "Database Error"
- Verify Supabase credentials in .env
- Make sure you ran the database schema SQL

### "GitHub API Error"  
- Check your GitHub token has correct permissions
- Verify your GitHub username is correct

### "JWT Error"
- Make sure JWT_SECRET is set in .env
- Try logging out and back in

## 📁 File Structure Overview
```
freedrive-mvp/
├── backend/          # Node.js API server
├── frontend/         # HTML/CSS/JS web app
├── deploy.sh         # Setup script
└── README.md         # Full documentation
```

## 🔄 Development Workflow

1. **Make changes** to backend or frontend code
2. **Backend**: Server auto-restarts (nodemon)
3. **Frontend**: Refresh browser to see changes
4. **Database**: Update schema in Supabase SQL editor

## 🚀 Deployment Ready?

When you're ready to deploy:

1. **Backend**: Deploy to Heroku, Railway, or any Node.js host
2. **Frontend**: Deploy to Netlify, Vercel, or any static host
3. **Database**: Your Supabase database is already hosted
4. **Environment**: Set production environment variables

## 📚 Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Explore the API endpoints in the backend routes
- Customize the frontend styling in the CSS files
- Add new features following the modular architecture

## 💡 Tips

- **Storage**: Each GitHub repo can store ~1GB via releases
- **Scaling**: App automatically creates new repos when needed
- **Security**: All files are private by default
- **Performance**: Files are served directly from GitHub's CDN

---

**Happy coding! 🎉**

Need help? Check the troubleshooting section in README.md
