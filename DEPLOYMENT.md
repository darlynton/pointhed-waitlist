# Deployment Guide

## Quick Deploy (100% Free Forever)

### 1. Deploy Database (Neon - Free Forever)

1. Go to [neon.tech](https://neon.tech) and sign up with GitHub
2. Create a new project (Free tier: 0.5GB storage, never expires)
3. Copy the connection string from the dashboard
4. Format: `postgresql://user:password@ep-xxx.neon.tech/dbname?sslmode=require`

**Alternative Free Options:**
- **Supabase**: [supabase.com](https://supabase.com) - 500MB free, includes auth
- **ElephantSQL**: [elephantsql.com](https://elephantsql.com) - 20MB free tier

### 2. Deploy Backend (Render - Free Tier)

**Via Render Dashboard (100% Free)**
1. Go to [render.com](https://render.com) and sign up with GitHub
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Settings:
   - **Name**: pointhed-waitlist-backend
   - **Root Directory**: `backend`
   - **Environment**: Node
   - **Build Command**: `npm install && npx prisma generate`
   - **Start Command**: `npx prisma migrate deploy && npm start`
5. Add environment variables:
   ```
   DATABASE_URL=<your-neon-postgres-url>
   PORT=3001
   NODE_ENV=production
   FRONTEND_URL=<your-vercel-frontend-url>
   EMAIL_SERVICE=gmail
   EMAIL_FROM=<your-email>
   EMAIL_USER=<your-email>
   EMAIL_PASSWORD=<your-app-password>
   WHATSAPP_API_TOKEN=<optional>
   WHATSAPP_PHONE_NUMBER_ID=<optional>
   ```
6. Click "Create Web Service"
7. Copy your backend URL (e.g., `https://your-app.onrender.com`)

⚠️ **Note**: Free tier spins down after 15 min of inactivity. First request may take 30-60s to wake up.

### 3. Deploy Frontend (Vercel)

**Option A: Via Vercel Dashboard (Easiest)**
1. Go to [vercel.com](https://vercel.com) and sign up
2. Click "Add New Project"
3. Import your GitHub repository
4. Set **Root Directory** to `frontend`
5. **Build settings** (auto-detected):
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
6. Add environment variables:
   ```
   VITE_API_URL=<your-railway-backend-url>/api/v1
   VITE_DISABLE_INSTANT=false
   VITE_HIDE_JOIN=false
   ```
7. Click "Deploy"
8. Copy your frontend URL

**Option B: Via Vercel CLI**
```bash
cd frontend
npm install -g vercel
vercel login
vercel --prod
```

### 4. Update Backend CORS

Go back to Railway and update your backend environment variable:
```ender → Your backend service → Environment → Edit:
```
FRONTEND_URL=<your-vercel-frontend-url>
```

Save changes. Render will auto-redeploy
---

## Alternative: Railway (30-day trial, then $5/month)

If you prefer Railway for better performance (no spin-down):

### Backend on Railway

1. Go to [railway.app](https://railway.app)
2. Create new project → "Deploy from GitHub repo"
3. Select your repository
4. Settings:
   - **Root Directory**: `backend`
   - Railway auto-detects Dockerfile
5. Add environment variables (same as Render above)
6. **Cost**: $5/month after 30-day trial

### Database on Railway

1. In your project, click "New" → "Database" → "PostgreSQL"
2. Copy DATABASE_URL from variables
3. **Cost**: Included in $5/month plan

---

## Alternative: Fly.io (Free tier available)

### Backend on Fly.io

1. Install Fly CLI: `brew install flyctl` (macOS)
2. Sign up: `fly auth signup`
3. Deploy:
   ```bash
   cd backend
   fly launch --name pointhed-backend
   # Select region, Postgres (optional), Redis (no)
   fly secrets set DATABASE_URL="your-neon-url"
   fly secrets set EMAIL_USER="your-email"
   fly secrets set EMAIL_PASSWORD="your-password"
   fly deploy
   ```
4. **Free tier**: 3 shared-cpu-1x VMs, 3GB storage

---

## Post-Deployment Checklist

- [ ] Database migrations ran successfully
- [ ] Backend health check responds: `curl https://your-backend/health`
- [ ] Frontend loads and can submit email form
- [ ] Email notifications work (test with a real email)
- [ ] CORS is properly configured
- [ ] Environment variables are set correctly
- [ ] SSL/HTTPS enabled on both frontend and backend

---

## Troubleshooting

### BackComparison

### 100% Free Forever (Recommended for MVP)
- **Database**: Neon.tech (0.5GB free forever)
- **Backend**: Render.com (free tier with spin-down)
- **Frontend**: Vercel (unlimited free for hobby)
- **Total**: $0/month ⚠️ Backend wakes from sleep in 30-60s

### Low-Cost Production ($5-10/month)
- **Database**: Neon.tech (free) or Railway ($5)
- **Backend**: Railway ($5) or Fly.io ($5)
- **Frontend**: Vercel (free)
- **Total**: $5-10/month (no spin-down, faster response)

### Recommended Start
Start with **100% free** (Neon + Render + Vercel). Upgrade backend to Railway or Fly.io when you get real users and need better performance.rmat: `postgresql://user:pass@host:port/db`
- Check if database service is running
- Verify network connectivity between services

---

## Cost Estimate

**Free Tier:**
- Railway: $5 free credit/month (enough for small traffic)
- Render: Free tier available (spins down after inactivity)
- Vercel: Free for hobby projects
- Neon DB: Free tier with 0.5GB storage

**Recommended Production:**
- Railway Hobby: $5/month (database + backend)
- Vercel Pro: Free to $20/month (hobby is free)
- **Total: $5-25/month**

---

## Environment Variables Reference

### Backend (.env)
```bash
DATABASE_URL="postgresql://..."
PORT=3001
NODE_ENV="production"
FRONTEND_URL="https://your-app.vercel.app"
EMAIL_SERVICE="gmail"
EMAIL_FROM="your-email@gmail.com"
EMAIL_USER="your-email@gmail.com"
EMAIL_PASSWORD="your-app-password"
WHATSAPP_API_TOKEN="optional"
WHATSAPP_PHONE_NUMBER_ID="optional"
```

### Frontend (.env)
```bash
VITE_API_URL=https://your-backend.railway.app/api/v1
VITE_DISABLE_INSTANT=false
VITE_HIDE_JOIN=false
```
