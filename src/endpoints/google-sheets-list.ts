import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../types";

export class GoogleSheetsList extends OpenAPIRoute {
  schema = {
    tags: ["Google Sheets"],
    summary: "List all sheets in the Google Spreadsheet",
    responses: {
      "200": {
        description: "List of sheets in the spreadsheet",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              spreadsheetId: z.string(),
              spreadsheetTitle: z.string(),
              sheets: z.array(z.object({
                sheetId: z.number(),
                title: z.string(),
                gridProperties: z.object({
                  rowCount: z.number(),
                  columnCount: z.number(),
                }).optional(),
              })),
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
      
      const spreadsheetId = c.env.GOOGLE_SPREADSHEET_ID;
      
      // Get spreadsheet metadata
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch spreadsheet: ${response.status} ${response.statusText}`);
      }

      const spreadsheetData = await response.json();

      // Extract sheet information
      const sheets = spreadsheetData.sheets?.map((sheet: any) => ({
        sheetId: sheet.properties.sheetId,
        title: sheet.properties.title,
        gridProperties: {
          rowCount: sheet.properties.gridProperties?.rowCount || 0,
          columnCount: sheet.properties.gridProperties?.columnCount || 0,
        },
      })) || [];

      return c.json({
        success: true,
        spreadsheetId: spreadsheetData.spreadsheetId,
        spreadsheetTitle: spreadsheetData.properties.title,
        sheets,
      });

    } catch (error) {
      console.error('Google Sheets list error:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list sheets',
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
      scope: 'https://www.googleapis.com/auth/spreadsheets',
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
