import { OpenAPIRoute } from 'chanfana';
import { createClient } from '@supabase/supabase-js';

export class AdminGetUsers extends OpenAPIRoute {
  static schema = {
    tags: ['Admin'],
    summary: 'Get all users with profiles (Admin only)',
    security: [{ bearerAuth: [] }],
    responses: {
      '200': {
        description: 'List of users with profiles',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                users: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      email: { type: 'string' },
                      role: { type: 'string' },
                      created_at: { type: 'string' },
                      last_sign_in_at: { type: 'string' },
                      profile_created_at: { type: 'string' },
                      profile_updated_at: { type: 'string' }
                    }
                  }
                }
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

  async handle(request: Request, env: any, context: any) {
    try {
      // Initialize Supabase with service role
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

      // Verify admin authentication
      const authResult = await this.verifyAdminAuth(request, supabase);
      if (!authResult.success) {
        return Response.json(authResult, { status: authResult.status });
      }

      // Get auth users
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      if (authError) throw authError;

      // Get user profiles
      const { data: profiles, error: profileError } = await supabase
        .from('user_profiles')
        .select('*');
      if (profileError) throw profileError;

      // Merge data
      const users = authUsers.users.map(authUser => {
        const profile = profiles?.find(p => p.id === authUser.id);
        return {
          id: authUser.id,
          email: authUser.email,
          created_at: authUser.created_at,
          last_sign_in_at: authUser.last_sign_in_at,
          role: profile?.role || null,
          profile_created_at: profile?.created_at,
          profile_updated_at: profile?.updated_at
        };
      });

      return Response.json({ success: true, users });
    } catch (error) {
      console.error('Error fetching users:', error);
      return Response.json(
        { success: false, error: 'Failed to fetch users' },
        { status: 500 }
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
