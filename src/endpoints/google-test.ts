import { OpenAPIRoute } from 'chanfana';
import { z } from 'zod';

export class GoogleTest extends OpenAPIRoute {
  schema = {
    tags: ['Google'],
    summary: 'Test Google Drive API access',
    responses: {
      '200': {
        description: 'Test result',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
              details: z.any().optional(),
            }),
          },
        },
      },
    },
  };

  async handle(c: any) {
    try {
      const env = c.env;
      
      // Check if all required environment variables are present
      if (!env.GOOGLE_PRIVATE_KEY || !env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY_ID) {
        return Response.json({
          success: false,
          message: 'Missing required Google environment variables',
          details: {
            hasPrivateKey: !!env.GOOGLE_PRIVATE_KEY,
            hasClientEmail: !!env.GOOGLE_CLIENT_EMAIL,
            hasPrivateKeyId: !!env.GOOGLE_PRIVATE_KEY_ID,
          },
        });
      }
      
      const accessToken = await this.getAccessToken(env);
      
      // Test basic Drive API access
      const testResponse = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        return Response.json({
          success: false,
          message: `Drive API access failed: ${testResponse.status}`,
          details: errorText,
        });
      }
      
      const result = await testResponse.json();
      
      return Response.json({
        success: true,
        message: 'Drive API access successful',
        details: result,
      });
    } catch (error: any) {
      return Response.json({
        success: false,
        message: error.message,
        details: error.stack,
      });
    }
  }

  private async getAccessToken(env: any): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    
    const jwtPayload = {
      iss: env.GOOGLE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const jwtHeader = {
      alg: 'RS256',
      typ: 'JWT',
      kid: env.GOOGLE_PRIVATE_KEY_ID,
    };

    const encodedHeader = btoa(JSON.stringify(jwtHeader)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const encodedPayload = btoa(JSON.stringify(jwtPayload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    
    // Parse the private key
    const privateKeyPem = env.GOOGLE_PRIVATE_KEY;
    const privateKeyDer = this.pemToArrayBuffer(privateKeyPem);
    
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyDer,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(unsignedToken)
    );
    
    const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    
    const jwt = `${unsignedToken}.${encodedSignature}`;
    
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token request failed: ${tokenResponse.status} - ${errorText}`);
    }
    
    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  }

  private pemToArrayBuffer(pem: string): ArrayBuffer {
    const pemContents = pem
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, '');
    
    const binaryString = atob(pemContents);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes.buffer;
  }
}