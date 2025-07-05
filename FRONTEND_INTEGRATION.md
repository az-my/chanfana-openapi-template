# 🔗 Frontend Integration Guide

## Update Your V3-SPPD-LEMBUR Frontend

### 1. Update Environment Variables

In your `FRONTEND_CODE/.env` file, add or update:

```env
# Admin API Backend (Cloudflare Worker)
VITE_ADMIN_API_URL=https://chanfana-openapi-template.ulielazmie.workers.dev

# Your existing Supabase config (keep these)
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 2. Create Admin API Service

Create `FRONTEND_CODE/src/lib/adminApi.ts`:

```typescript
import { supabase } from './supabaseClient';

const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL;

class AdminApiService {
  private async getAuthToken(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('No authenticated session');
    }
    return session.access_token;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const token = await this.getAuthToken();
    
    const response = await fetch(`${ADMIN_API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API request failed');
    }

    return response.json();
  }

  // Get all users with their roles
  async getUsers() {
    return this.request('/api/admin/users');
  }

  // Create a new user
  async createUser(userData: {
    email: string;
    password: string;
    role: string;
    metadata?: Record<string, any>;
  }) {
    return this.request('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  // Delete a user
  async deleteUser(userId: string) {
    return this.request(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    });
  }

  // Health check
  async healthCheck() {
    const response = await fetch(`${ADMIN_API_URL}/api/health`);
    return response.json();
  }
}

export const adminApi = new AdminApiService();
```

### 3. Update Admin Components

Update your admin components to use the new API service:

```typescript
// Example: Update your user management component
import { adminApi } from '../lib/adminApi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function AdminUserManagement() {
  const queryClient = useQueryClient();

  // Fetch users
  const { data: users, isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminApi.getUsers(),
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: adminApi.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  // Component JSX...
}
```

### 4. Test the Integration

1. Start your frontend development server:
   ```bash
   cd FRONTEND_CODE
   npm run dev
   ```

2. Test admin functions:
   - Login as an admin user
   - Try listing users
   - Try creating a new user
   - Try deleting a user

### 5. Update CORS (if needed)

If you deploy your frontend to a different domain, update the CORS settings in the worker:

```typescript
// In worker src/index.ts, update the origin array:
origin: [
  'http://localhost:3000', 
  'http://localhost:5173',
  'https://your-production-domain.com', // Add your actual domain
  'https://your-app.vercel.app', // Add Vercel URL if using Vercel
],
```

Then redeploy the worker:
```bash
cd g:\V3-SPPD-LEMBUR-WORKER
npm run deploy
```

### 6. Error Handling

Add proper error handling in your components:

```typescript
try {
  const users = await adminApi.getUsers();
  // Handle success
} catch (error) {
  if (error.message.includes('No authenticated session')) {
    // Redirect to login
  } else if (error.message.includes('Unauthorized')) {
    // Show "insufficient permissions" message
  } else {
    // Show generic error message
  }
}
```

---

## 🎯 Key Benefits

- ✅ **Secure**: Service role key never exposed to frontend
- ✅ **Fast**: Edge-deployed for low latency
- ✅ **Scalable**: Automatically handles traffic spikes
- ✅ **Reliable**: Cloudflare's global network
- ✅ **Cost-effective**: Pay only for usage

Your admin API is now **production-ready** and **securely integrated**! 🚀
