# Pointhed Waitlist Landing Page

Standalone deployable version of the Pointhed waitlist landing page. This is a complete, production-ready project that can be deployed independently from the main Pointhed application.

## Features

- **Email Waitlist Signup** - Capture early access requests via email
- **Instant WhatsApp Demo** - Send live demo messages via WhatsApp
- **Revenue Calculator** - Interactive ROI calculator with multi-currency support
- **Responsive Design** - Mobile-first, optimized for all devices
- **Real-time Validation** - Client and server-side validation
- **Position Tracking** - Shows users their position in the waitlist queue

## Project Structure

```
waitlist-deploy/
├── frontend/          # React + Vite frontend
│   ├── src/
│   │   ├── WaitlistLanding.tsx
│   │   ├── Button.tsx, Input.tsx, Label.tsx, Card.tsx
│   │   ├── ImageWithFallback.tsx
│   │   ├── utils.ts
│   │   ├── main.tsx
│   │   ├── index.css
│   │   └── assets (logo, images)
│   ├── package.json
│   ├── vite.config.ts
│   └── .env
├── backend/           # Node.js + Express API
│   ├── src/
│   │   ├── server.js
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── package.json
│   └── .env
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- (Optional) WhatsApp Business API credentials
- (Optional) Email service credentials (Gmail, SendGrid, or SMTP)

### 1. Database Setup

Create a PostgreSQL database:

\`\`\`bash
createdb waitlist_deploy
\`\`\`

### 2. Backend Setup

\`\`\`bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Start server
npm run dev
\`\`\`

Backend will run on http://localhost:3001

### 3. Frontend Setup

\`\`\`bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
\`\`\`

Frontend will run on http://localhost:5173

## Environment Variables

### Backend (.env)

\`\`\`bash
# Required
DATABASE_URL="postgresql://user@localhost:5432/waitlist_deploy"
PORT=3001
FRONTEND_URL="http://localhost:5173"

# Optional - WhatsApp Integration
WHATSAPP_API_TOKEN="your_token"
WHATSAPP_PHONE_NUMBER_ID="your_phone_id"

# Optional - Email Notifications
EMAIL_SERVICE="gmail"
EMAIL_FROM="your-email@gmail.com"
EMAIL_USER="your-email@gmail.com"
EMAIL_PASSWORD="your-app-password"
\`\`\`

### Frontend (.env)

\`\`\`bash
VITE_API_URL=http://127.0.0.1:3001/api/v1
\`\`\`

## Deployment

### Railway (Recommended for MVP)

1. **Backend**:
   - Push code to GitHub
   - Create new Railway project from GitHub repo
   - Add PostgreSQL service
   - Set environment variables
   - Deploy from `backend` directory

2. **Frontend**:
   - Create new Railway service
   - Deploy from `frontend` directory
   - Set `VITE_API_URL` to your backend URL

### Docker

\`\`\`bash
# Build backend
cd backend
docker build -t pointhed-waitlist-backend .

# Build frontend
cd frontend
docker build -t pointhed-waitlist-frontend .

# Run with docker-compose
docker-compose up
\`\`\`

### Vercel/Netlify (Frontend Only)

\`\`\`bash
cd frontend
npm run build
# Deploy dist/ folder
\`\`\`

Backend must be deployed separately (Railway, Heroku, AWS, etc.)

## API Endpoints

### POST /api/v1/waitlist
Join email waitlist

\`\`\`json
{
  "email": "user@example.com",
  "source": "landing_page"
}
\`\`\`

### POST /api/v1/whatsapp/instant
Send instant WhatsApp demo

\`\`\`json
{
  "phoneNumber": "+447404938935"
}
\`\`\`

### GET /health
Health check endpoint

## Database Schema

### waitlist
- id (UUID, PK)
- email (VARCHAR(255), UNIQUE)
- source (VARCHAR(100))
- status (VARCHAR(50))
- metadata (JSON)
- created_at, updated_at (TIMESTAMPTZ)

### whatsapp_leads
- id (UUID, PK)
- phone_number (VARCHAR(20))
- country_code (VARCHAR(5))
- raw_number (VARCHAR(20))
- source (VARCHAR(100))
- status (VARCHAR(50))
- message_id (VARCHAR(255))
- metadata (JSON)
- created_at, updated_at (TIMESTAMPTZ)

## Development

### Frontend
\`\`\`bash
cd frontend
npm run dev    # Start dev server
npm run build  # Build for production
\`\`\`

### Backend
\`\`\`bash
cd backend
npm run dev              # Start with watch mode
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run migrations
npm run db:migrate:prod  # Deploy migrations (production)
\`\`\`

## Troubleshooting

### "Failed to fetch" error
- Ensure backend is running on port 3001
- Check VITE_API_URL in frontend/.env
- Verify CORS settings in backend

### WhatsApp not sending
- Verify WHATSAPP_API_TOKEN is valid
- Check WHATSAPP_PHONE_NUMBER_ID
- Ensure phone number is in E.164 format (+country_code + number)

### Email not sending
- For Gmail: use App Password, not regular password
- Check EMAIL_SERVICE configuration
- Verify transporter settings

## Production Checklist

- [ ] Set NODE_ENV=production
- [ ] Use production database URL
- [ ] Enable database SSL
- [ ] Set strong JWT_SECRET (if needed later)
- [ ] Configure CORS for production domain
- [ ] Set up monitoring (Sentry, LogRocket)
- [ ] Enable rate limiting
- [ ] Set up automated backups
- [ ] Configure CDN for static assets
- [ ] Enable HTTPS
- [ ] Review security headers (Helmet.js)

## Support

For issues or questions:
- Email: support@pointhed.com
- Documentation: https://docs.pointhed.com

## License

Proprietary - © 2026 Pointhed
