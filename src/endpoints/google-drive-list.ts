import { OpenAPIRoute, Query, Str } from "chanfana";
import { z } from "zod";

export class GoogleDriveList extends OpenAPIRoute {
  schema = {
    tags: ["Google Drive"],
    summary: "List files and folders in Google Drive",
    request: {
      query: z.object({
        folderId: z.string().optional().describe("ID of the folder to list. Defaults to root if not provided."),
      }),
    },
    responses: {
      "200": {
        description: "List of files and folders",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              files: z.array(z.object({
                id: z.string(),
                name: z.string(),
                mimeType: z.string(),
                webViewLink: z.string().optional(),
              })),
            }),
          },
        },
      },
    },
  };

  async handle(c: any) {
    try {
      const env = c.env;
      const { folderId } = c.req.query;

      const accessToken = await this.getAccessToken(env);

      let query = "'me' in owners"; // Default to files owned by the service account
      if (folderId) {
        query = `'${folderId}' in parents`;
      }

      const listResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink)`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        throw new Error(`Drive API list failed: ${listResponse.status} - ${errorText}`);
      }

      const result = await listResponse.json();

      return c.json({
        success: true,
        files: result.files,
      });

    } catch (error) {
      console.error('Google Drive list error:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list files',
        },
        500
      );
    }
  }

  private async getAccessToken(env: any): Promise<string> {
    const jwtHeader = {
      alg: 'RS256',
      typ: 'JWT',
      kid: env.GOOGLE_PRIVATE_KEY_ID,
    };

    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iss: env.GOOGLE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const encodedHeader = btoa(JSON.stringify(jwtHeader)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const encodedPayload = btoa(JSON.stringify(jwtPayload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    
    const privateKeyPem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    const pemContents = privateKeyPem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');
    
    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
      binaryDer[i] = binaryDerString.charCodeAt(i);
    }
    
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryDer,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
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
      throw new Error(`Token request failed: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  }
}