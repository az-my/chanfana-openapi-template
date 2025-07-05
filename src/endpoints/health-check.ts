import { OpenAPIRoute } from 'chanfana';
import { AppContext } from '../types';

export class HealthCheck extends OpenAPIRoute {
  static schema = {
    tags: ['Health'],
    summary: 'Health check endpoint',
    responses: {
      '200': {
        description: 'Service is healthy',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                status: { type: 'string', example: 'ok' },
                message: { type: 'string', example: 'Admin API is running' },
                timestamp: { type: 'string', format: 'date-time' }
              }
            }
          }
        }
      }
    }
  };

  async handle(c: AppContext) {
    return c.json({
      status: 'ok',
      message: 'Admin API is running',
      timestamp: new Date().toISOString()
    });
  }
}
