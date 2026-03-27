# Development Setup Script
Write-Host "🚀 Setting up Anonymous Defenders Development Environment..."

# Check if Docker is running
try {
    docker version | Out-Null
    Write-Host "✅ Docker is running"
} catch {
    Write-Host "❌ Docker is not running. Please start Docker first."
    exit 1
}

# Create .env file for local development
Write-Host "📝 Creating local .env file..."
$envContent = @"
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
AI_MODEL_TOKEN=f5697e0c-1a07-4da7-912b-fccf3eadd33a
AI_SERVER_URL=https://8000-dep-01k4nsrem33a9apxmbcx67crcj-d.cloudspaces.litng.ai
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=kareemwally7@gmail.com
EMAIL_PASS=plyakkrjqjbetnzh
SUPPORT_EMAIL=kareemwally7@gmail.com
FREE_PLAN_DAILY_LIMIT=3
PLAN_A_DAILY_LIMIT=10
PLAN_B_DAILY_LIMIT=25
PLAN_C_DAILY_LIMIT=50
PLAN_D_DAILY_LIMIT=100
PLAN_A_MONTHLY_PRICE=300
PLAN_B_MONTHLY_PRICE=600
PLAN_C_MONTHLY_PRICE=1200
PLAN_D_MONTHLY_PRICE=2400
PAYMOB_API_KEY=ZXlKaGJHY2lPaUpJVXpVeE1pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SmpiR0Z6Y3lJNklrMWxjbU5vWVc1MElpd2ljSEp2Wm1sc1pWOXdheUk2TVRFek9Ea3pOaXdpYm1GdFpTSTZJbWx1YVhScFlXd2lmUS5MSG9YdWpmWC1GMmZnSVpmU05LQktoOUZUV3VKa3JGRVl5REw3YlN2TDgybnFjXzQxcjZGVDd15Wm9tbF8zbUk3c3d3MVBvei1JeE1pX1VjSnNMN2dEZw==
PAYMOB_INTEGRATION_ID=5572353
PAYMOB_WALLET_INTEGRATION_ID=5572396
PAYMOB_CARD_INTEGRATION_ID=5572353
PAYMOB_HMAC_SECRET=1E8CE0A51EE26A6FB10E2A14C9BEC4CA
PAYMOB_IFRAME_ID=1013390
DB_URI=mongodb+srv://Anoy_User:=f9cW2_8TLsc2W9@myatlasclusteredu.mvc0fy6.mongodb.net/Anonymous?retryWrites=true&w=majority&appName=myAtlasClusterEDU
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
GOOGLE_CLIENT_ID=1024342754623-d3daqj75k2urr5q8v82uo2q2pn4im7vo.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GITHUB_CLIENT_ID=Ov23liMiCLgjiZGvrREv
GITHUB_CLIENT_SECRET=3e951bfce654f348072eb305f1b1ddbcb5aacb80
"@

$envContent | Out-File -FilePath ".env" -Encoding UTF8
Write-Host "✅ .env file created"

# Build and run Docker container
Write-Host "🐳 Building Docker image..."
docker build -t anonymous-defenders:dev .

Write-Host "🚀 Starting development container..."
docker run -d `
    --name anonymous-defenders-dev `
    -p 3000:3000 `
    --env-file .env `
    anonymous-defenders:dev

Write-Host ""
Write-Host "🎉 Development environment is ready!"
Write-Host "📍 Application URL: http://localhost:3000"
Write-Host "📋 Useful commands:"
Write-Host "  - View logs: docker logs -f anonymous-defenders-dev"
Write-Host "  - Stop container: docker stop anonymous-defenders-dev"
Write-Host "  - Start container: docker start anonymous-defenders-dev"
Write-Host "  - Remove container: docker rm anonymous-defenders-dev"
