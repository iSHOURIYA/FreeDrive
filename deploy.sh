#!/bin/bash

# FreeDrive MVP Deployment Script
# This script helps deploy the FreeDrive application

set -e

echo "🚀 FreeDrive MVP Deployment Script"
echo "=================================="

# Check if we're in the right directory
if [ ! -f "README.md" ] || [ ! -d "backend" ] || [ ! -d "frontend" ]; then
    echo "❌ Error: Please run this script from the freedrive-mvp root directory"
    exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command_exists node; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

if ! command_exists npm; then
    echo "❌ npm is not installed. Please install npm and try again."
    exit 1
fi

if ! command_exists git; then
    echo "❌ Git is not installed. Please install Git and try again."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Ask for deployment type
echo ""
echo "📦 Deployment Options:"
echo "1. Development setup (local development)"
echo "2. Production build (prepare for deployment)"
echo "3. Full setup (install dependencies and setup environment)"

read -p "Choose deployment type (1-3): " deploy_type

case $deploy_type in
    1)
        echo "🔧 Setting up development environment..."
        
        # Install backend dependencies
        echo "Installing backend dependencies..."
        cd backend
        npm install
        cd ..
        
        # Install frontend dependencies
        echo "Installing frontend dependencies..."
        cd frontend
        npm install
        cd ..
        
        # Check for .env file
        if [ ! -f "backend/.env" ]; then
            echo "⚠️  No .env file found in backend directory"
            echo "📝 Please copy backend/.env.example to backend/.env and fill in your values"
            cp backend/.env.example backend/.env
        fi
        
        echo "✅ Development environment setup complete!"
        echo ""
        echo "🚀 To start the application:"
        echo "1. Configure backend/.env with your API keys"
        echo "2. Run 'cd backend && npm run dev' in one terminal"
        echo "3. Run 'cd frontend && npm start' in another terminal"
        echo "4. Open http://localhost:3001 in your browser"
        ;;
        
    2)
        echo "🏗️  Building for production..."
        
        # Install dependencies
        cd backend
        npm install --production
        cd ../frontend
        npm install
        
        # Build frontend (if build script exists)
        if npm run | grep -q "build"; then
            npm run build
        fi
        
        cd ..
        
        echo "✅ Production build complete!"
        echo ""
        echo "📁 Files ready for deployment:"
        echo "- Backend: ./backend/ (upload to your server)"
        echo "- Frontend: ./frontend/ (upload to your web host)"
        echo ""
        echo "📝 Remember to:"
        echo "1. Set up environment variables on your server"
        echo "2. Configure your database (run database_schema.sql)"
        echo "3. Set up your domain and SSL certificate"
        ;;
        
    3)
        echo "🔧 Full setup and configuration..."
        
        # Install dependencies
        echo "Installing dependencies..."
        cd backend
        npm install
        cd ../frontend
        npm install
        cd ..
        
        # Create .env if it doesn't exist
        if [ ! -f "backend/.env" ]; then
            cp backend/.env.example backend/.env
            echo "📝 Created backend/.env from template"
        fi
        
        # Database setup reminder
        echo ""
        echo "📊 Database Setup Required:"
        echo "1. Create a Supabase project at https://supabase.com"
        echo "2. Run the SQL from backend/database_schema.sql in your Supabase SQL editor"
        echo "3. Update backend/.env with your Supabase credentials"
        
        # GitHub setup reminder
        echo ""
        echo "🐙 GitHub Setup Required:"
        echo "1. Create a GitHub Personal Access Token at https://github.com/settings/tokens"
        echo "2. Grant 'repo' and 'delete_repo' permissions"
        echo "3. Update backend/.env with your GitHub token and username"
        
        echo ""
        echo "✅ Full setup complete!"
        echo "📝 Next steps:"
        echo "1. Configure all values in backend/.env"
        echo "2. Test with: cd backend && npm run dev"
        echo "3. In another terminal: cd frontend && npm start"
        ;;
        
    *)
        echo "❌ Invalid option. Please choose 1, 2, or 3."
        exit 1
        ;;
esac

echo ""
echo "🎉 Deployment script completed!"
echo "📚 For more information, see README.md"
