import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";

const GoogleDriveCreateFolderSchema = z.object({
  folderName: z.string().describe("Name of the new folder"),
  parentFolderId: z.string().optional().describe("ID of the parent folder. Defaults to root if not provided."),
});

export class GoogleDriveCreateFolder extends OpenAPIRoute {
  schema = {
    tags: ["Google Drive"],
    summary: "Create a new folder in Google Drive",
    request: {
      body: {
        content: {
          "application/json": {
            schema: GoogleDriveCreateFolderSchema,
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Folder created successfully",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              folderId: z.string(),
              folderName: z.string(),
              webViewLink: z.string().optional(),
            }),
          },
        },
      },
    },
  };

  async handle(c: any) {
    try {
      const env = c.env;
      const { folderName, parentFolderId } = await c.req.json();

      const accessToken = await this.getAccessToken(env);

      const metadata: { name: string; mimeType: string; parents?: string[] } = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      };

      if (parentFolderId) {
        metadata.parents = [parentFolderId];
      }

      const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        throw new Error(`Drive API create folder failed: ${createResponse.status} - ${errorText}`);
      }

      const result = await createResponse.json();

      return c.json({
        success: true,
        folderId: result.id,
        folderName: result.name,
        webViewLink: result.webViewLink,
      });

    } catch (error) {
      console.error('Google Drive create folder error:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create folder',
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
      scope: 'https://www.googleapis.com/auth/drive',
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