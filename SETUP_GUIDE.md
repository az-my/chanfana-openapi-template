# V3 SPPD LEMBUR Admin API Worker Setup

## 🎉 Your Worker is Ready!

You now have a separate Cloudflare Worker project at:
```
G:\V3-SPPD-LEMBUR-WORKER\
```

This is completely separate from your frontend and follows best practices.

## 🚀 Quick Setup Steps

### 1. Set Your Supabase Credentials
```bash
cd G:\V3-SPPD-LEMBUR-WORKER

# Login to Cloudflare (opens browser)
wrangler login

# Set your Supabase URL as a secret
wrangler secret put SUPABASE_URL

# Set your Supabase service role key as a secret (MOST IMPORTANT!)
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

When prompted, enter:
- **SUPABASE_URL**: Your Supabase project URL (e.g., `https://abc123.supabase.co`)
- **SUPABASE_SERVICE_ROLE_KEY**: Your Supabase service role key (NOT the anon key!)

### 2. Test Locally
```bash
cd G:\V3-SPPD-LEMBUR-WORKER
npm run dev
```

This will start your worker locally at `http://localhost:8787`

### 3. View API Documentation
Once running, visit:
- `http://localhost:8787/` - Interactive OpenAPI documentation
- `http://localhost:8787/api/health` - Health check endpoint

### 4. Deploy to Production
```bash
cd G:\V3-SPPD-LEMBUR-WORKER
npm run deploy
```

## 📋 Available Endpoints

Your worker now includes:

### Health Check
- **GET** `/api/health` - Check if API is running

### Admin User Management (Requires admin JWT token)
- **GET** `/api/admin/users` - Get all users with emails
- **POST** `/api/admin/users` - Create new user with role
- **DELETE** `/api/admin/users/:userId` - Delete user

### Example Usage
```bash
# Health check (no auth required)
curl http://localhost:8787/api/health

# Get users (admin token required)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:8787/api/admin/users

# Create user (admin token required)
curl -X POST \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"password123","role":"teknisi_serpo"}' \
     http://localhost:8787/api/admin/users
```

## 🔧 Update Your Frontend

In your main frontend project (`G:\V3-SPPD-LEMBUR\FRONTEND_CODE`), update the environment variable:

```env
# For local development
VITE_ADMIN_API_URL=http://localhost:8787

# For production (after deployment)
VITE_ADMIN_API_URL=https://v3-sppd-lembur-admin-api.your-subdomain.workers.dev
```

## 🔒 Security Features

✅ **JWT Authentication**: All admin endpoints verify tokens
✅ **Role-Based Access**: Only `admin_serpo` users can access admin endpoints
✅ **Service Role Security**: Key stored as encrypted secret in Cloudflare
✅ **CORS Protection**: Configured for your frontend domains
✅ **OpenAPI Validation**: Request/response validation
✅ **Auto Documentation**: Interactive API docs

## 📁 Project Structure

```
G:\V3-SPPD-LEMBUR-WORKER\
├── src/
│   ├── endpoints/
│   │   ├── admin-get-users.ts     # Get all users
│   │   ├── admin-create-user.ts   # Create user
│   │   ├── admin-delete-user.ts   # Delete user
│   │   ├── health-check.ts        # Health check
│   │   └── ...existing endpoints
│   └── index.ts                   # Main router
├── wrangler.jsonc                 # Worker configuration
└── package.json                   # Dependencies
```

## 🎯 Benefits of This Setup

✅ **Separate Concerns**: Frontend and backend are independent
✅ **Secure**: Service role key never exposed to frontend
✅ **Scalable**: Deploy frontend and API independently
✅ **Professional**: Follows industry best practices
✅ **Fast**: Runs on Cloudflare's global edge network
✅ **Cost-Effective**: Generous free tier
✅ **Documented**: Auto-generated OpenAPI docs

## 🔄 Development Workflow

1. **Frontend**: Develop in `G:\V3-SPPD-LEMBUR\FRONTEND_CODE\`
2. **Backend API**: Develop in `G:\V3-SPPD-LEMBUR-WORKER\`
3. **Deploy Separately**: 
   - Frontend to Vercel/Netlify
   - API to Cloudflare Workers
4. **Update Frontend**: Point to deployed API URL

## 🚨 Important Notes

- **Never commit** your service role key to Git
- **Always use secrets** for sensitive environment variables
- **Test locally first** before deploying
- **Update CORS origins** in `src/index.ts` for your production domains

## 🎉 What Happens Next

Once you complete the setup:

1. Your `UserManagement.tsx` component will automatically detect the admin API
2. Full user creation and deletion will be enabled
3. You'll have professional API documentation
4. Everything will be secure and scalable

Your RBAC system is now complete with both client-side and server-side capabilities!
