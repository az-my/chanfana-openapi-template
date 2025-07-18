import { OpenAPIRoute } from 'chanfana';
import { createClient } from '@supabase/supabase-js';
import { AppContext } from '../types';

export class AdminDeleteUser extends OpenAPIRoute {
  static schema = {
    tags: ['Admin'],
    summary: 'Delete user by ID (Admin only)',
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'userId',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'User ID to delete'
      }
    ],
    responses: {
      '200': {
        description: 'User deleted successfully',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                success: { type: 'boolean' },
                message: { type: 'string' }
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
      },
      '404': {
        description: 'User not found',
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
      
      // Initialize Supabase with service role
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

      // Verify admin authentication
      const authResult = await this.verifyAdminAuth(c.req.raw, supabase);
      if (!authResult.success) {
        return c.json(authResult, authResult.status as any);
      }

      const userId = c.req.param('userId');

      if (!userId) {
        return c.json(
          { success: false, error: 'User ID is required' },
          400
        );
      }

      // Delete auth user (profile will cascade delete due to foreign key)
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) {
        if (error.message.includes('not found')) {
          return c.json(
            { success: false, error: 'User not found' },
            404
          );
        }
        throw error;
      }

      return c.json({ 
        success: true, 
        message: 'User deleted successfully' 
      });

    } catch (error) {
      console.error('Error deleting user:', error);
      return c.json(
        { success: false, error: 'Failed to delete user' },
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
