import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../types";

const GoogleSheetsReadSchema = z.object({
  sheetName: z.string().describe("Name of the sheet to read data from"),
  range: z.string().optional().describe("Range to read (e.g., 'A1:Z100'), defaults to all data"),
});

export class GoogleSheetsRead extends OpenAPIRoute {
  schema = {
    tags: ["Google Sheets"],
    summary: "Read data from a specific sheet",
    request: {
      body: {
        content: {
          "application/json": {
            schema: GoogleSheetsReadSchema,
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Data read successfully",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              sheetName: z.string(),
              range: z.string(),
              data: z.array(z.array(z.any())),
              rowCount: z.number(),
            }),
          },
        },
      },
    },
  };

  async handle(c: HandleArgs[0]) {
    try {
      const body = await c.req.json();
      const { sheetName, range } = GoogleSheetsReadSchema.parse(body);

      // Get access token using service account
      const accessToken = await this.getAccessToken(c.env);
      
      const spreadsheetId = c.env.GOOGLE_SPREADSHEET_ID;

      // Determine the range to read
      const readRange = range || `${sheetName}`;

      // Read data from the specified sheet
      const readResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(readRange)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!readResponse.ok) {
        const errorText = await readResponse.text();
        throw new Error(`Failed to read data: ${readResponse.status} ${readResponse.statusText}. Details: ${errorText}`);
      }

      const result = await readResponse.json();

      return c.json({
        success: true,
        sheetName,
        range: result.range || readRange,
        data: result.values || [],
        rowCount: result.values ? result.values.length : 0,
      });

    } catch (error) {
      console.error('Google Sheets read error:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read data',
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
