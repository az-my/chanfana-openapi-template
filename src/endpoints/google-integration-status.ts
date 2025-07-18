import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../types";

export class GoogleIntegrationStatus extends OpenAPIRoute {
  schema = {
    tags: ["Google Integration"],
    summary: "Check Google Drive and Sheets integration status",
    responses: {
      "200": {
        description: "Integration status",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              googleDrive: z.object({
                connected: z.boolean(),
                error: z.string().optional(),
              }),
              googleSheets: z.object({
                connected: z.boolean(),
                spreadsheetId: z.string().optional(),
                error: z.string().optional(),
              }),
              timestamp: z.string(),
            }),
          },
        },
      },
    },
  };

  async handle(c: HandleArgs[0]) {
    try {
      // Get access token using service account
      const accessToken = await this.getAccessToken(c.env);

      // Test Drive API
      let driveStatus = 'connected';
      let driveError = null;
      try {
        const driveResponse = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        
        if (!driveResponse.ok) {
          throw new Error(`Drive API test failed: ${driveResponse.status}`);
        }
      } catch (error) {
        driveStatus = 'error';
        driveError = error instanceof Error ? error.message : 'Unknown error';
      }

      // Test Sheets API
      let sheetsStatus = 'connected';
      let sheetsError = null;
      try {
        if (c.env.GOOGLE_SPREADSHEET_ID) {
          const sheetsResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${c.env.GOOGLE_SPREADSHEET_ID}`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          });
          
          if (!sheetsResponse.ok) {
            throw new Error(`Sheets API test failed: ${sheetsResponse.status}`);
          }
        } else {
          // Just test authentication by creating a test spreadsheet
          const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              properties: {
                title: 'Test Spreadsheet - Delete Me',
              },
            }),
          });
          
          if (!createResponse.ok) {
            throw new Error(`Sheets API test failed: ${createResponse.status}`);
          }
        }
      } catch (error) {
        sheetsStatus = 'error';
        sheetsError = error instanceof Error ? error.message : 'Unknown error';
      }

      const overallStatus = driveStatus === 'connected' && sheetsStatus === 'connected' ? 'connected' : 'error';

      return c.json({
        status: overallStatus,
        services: {
          drive: {
            status: driveStatus,
            error: driveError,
          },
          sheets: {
            status: sheetsStatus,
            error: sheetsError,
          },
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('Google integration status error:', error);
      return c.json(
        {
          status: 'error',
          error: error instanceof Error ? error.message : 'Status check failed',
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  }

  private async getAccessToken(env: any): Promise<string> {
    const jwtHeader = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iss: env.GOOGLE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const encodedHeader = btoa(JSON.stringify(jwtHeader)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const encodedPayload = btoa(JSON.stringify(jwtPayload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    
    // Convert PEM private key to ArrayBuffer
    const privateKeyPem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    const pemHeader = '-----BEGIN PRIVATE KEY-----';
    const pemFooter = '-----END PRIVATE KEY-----';
    const pemContents = privateKeyPem.replace(pemHeader, '').replace(pemFooter, '').replace(/\s/g, '');
    
    // Decode base64 to get the raw key data
    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
      binaryDer[i] = binaryDerString.charCodeAt(i);
    }
    
    // Import the private key
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

    // Sign the token
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

    // Exchange JWT for access token
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