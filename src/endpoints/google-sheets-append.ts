import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../types";

const GoogleSheetsAppendSchema = z.object({
  sheetName: z.string().describe("Name of the sheet to append data to"),
  data: z.array(z.array(z.any())).describe("2D array of data to append (rows and columns)"),
  range: z.string().optional().describe("Optional range like 'A:Z', defaults to 'A:Z'"),
});

export class GoogleSheetsAppend extends OpenAPIRoute {
  schema = {
    tags: ["Google Sheets"],
    summary: "Append data to a specific sheet by name",
    request: {
      body: {
        content: {
          "application/json": {
            schema: GoogleSheetsAppendSchema,
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Data appended successfully",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              spreadsheetId: z.string(),
              sheetName: z.string(),
              updatedRange: z.string().optional(),
              updatedRows: z.number().optional(),
            }),
          },
        },
      },
    },
  };

  async handle(c: HandleArgs[0]) {
    try {
      const body = await c.req.json();
      const { sheetName, data, range = "A:Z" } = GoogleSheetsAppendSchema.parse(body);

      // Get access token using service account
      const accessToken = await this.getAccessToken(c.env);
      
      const spreadsheetId = c.env.GOOGLE_SPREADSHEET_ID;

      // Verify the sheet exists by getting spreadsheet metadata
      const metadataResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!metadataResponse.ok) {
        throw new Error(`Failed to fetch spreadsheet metadata: ${metadataResponse.status}`);
      }

      const metadata = await metadataResponse.json();
      const sheet = metadata.sheets?.find((s: any) => s.properties.title === sheetName);
      
      if (!sheet) {
        const availableSheets = metadata.sheets?.map((s: any) => s.properties.title).join(', ') || 'none';
        throw new Error(`Sheet "${sheetName}" not found. Available sheets: ${availableSheets}`);
      }

      // Append data to the specified sheet
      const appendResponse = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!${range}:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: data,
          }),
        }
      );

      if (!appendResponse.ok) {
        const errorText = await appendResponse.text();
        throw new Error(`Failed to append data: ${appendResponse.status} ${appendResponse.statusText}. Details: ${errorText}`);
      }

      const result = await appendResponse.json();

      return c.json({
        success: true,
        spreadsheetId,
        sheetName,
        updatedRange: result.updates?.updatedRange,
        updatedRows: result.updates?.updatedRows,
      });

    } catch (error) {
      console.error('Google Sheets append error:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to append data',
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
