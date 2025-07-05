import { OpenAPIRoute } from 'chanfana';
import { createClient } from '@supabase/supabase-js';
import { AppContext } from '../types';

export class AdminCreateUser extends OpenAPIRoute {
  static schema = {
    tags: ['Admin'],
    summary: 'Create new user with role (Admin only)',
    security: [{ bearerAuth: [] }],
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email' },
              password: { type: 'string', minLength: 6 },
              role: { 
                type: 'string', 
                enum: ['admin_serpo', 'teknisi_serpo'] 
              }
            },
            required: ['email', 'password', 'role']
          }
        }
      }
    },
    responses: {
      '201': {
        description: 'User created successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    role: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      },
      '400': {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: { type: 'string' }
              }
            }
          }
        }
      },
      '401': {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: { type: 'string' }
              }
            }
          }
        }
      },
      '403': {
        description: 'Forbidden - Admin access required',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean', example: false },
                error: { type: 'string' }
              }
            }
          }
        }
      }
    }
  };

  async handle(c: AppContext) {
    try {
      const env = c.env;
      
      // Debug: Log environment variables
      console.log('Environment variables:', {
        SUPABASE_URL: env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ? 'PRESENT' : 'MISSING',
        ENV_KEYS: Object.keys(env)
      });

      if (!env.SUPABASE_URL) {
        throw new Error(`supabaseUrl is required. Available env keys: ${Object.keys(env).join(', ')}`);
      }

      if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error(`supabaseServiceRoleKey is required. Available env keys: ${Object.keys(env).join(', ')}`);
      }

      // Initialize Supabase with service role
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

      // Verify admin authentication
      const authResult = await this.verifyAdminAuth(c.req.raw, supabase);
      if (!authResult.success) {
        return c.json(authResult, authResult.status as any);
      }

      // Parse request body
      const body = await c.req.json() as { email?: string; password?: string; role?: string };
      const { email, password, role } = body;

      if (!email || !password || !role) {
        return c.json(
          { success: false, error: 'Email, password, and role are required' },
          400
        );
      }

      if (!['admin_serpo', 'teknisi_serpo'].includes(role)) {
        return c.json(
          { success: false, error: 'Invalid role' },
          400
        );
      }

      // Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('User creation failed');

      // Create user profile
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          role,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (profileError) throw profileError;

      return c.json({ 
        success: true, 
        user: {
          id: authData.user.id,
          email: authData.user.email,
          role
        }
      }, 201);

    } catch (error) {
      console.error('Error creating user:', error);
      return c.json(
        { success: false, error: (error as Error).message || 'Failed to create user' },
        500
      );
    }
  }

  private async verifyAdminAuth(request: Request, supabase: any) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return { success: false, error: 'No authorization header', status: 401 };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return { success: false, error: 'Invalid token', status: 401 };
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin_serpo') {
      return { success: false, error: 'Admin access required', status: 403 };
    }

    return { success: true, user };
  }
}
