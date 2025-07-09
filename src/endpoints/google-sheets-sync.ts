import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../types";

const GoogleSheetsSyncSchema = z.object({
  incidentData: z.object({
    id: z.string(),
    tanggal: z.string(),
    waktu: z.string(),
    lokasi: z.string(),
    deskripsi: z.string(),
    teknisi: z.string(),
    status: z.string(),
    prioritas: z.string(),
  }),
});

export class GoogleSheetsSync extends OpenAPIRoute {
  schema = {
    tags: ["Google Sheets"],
    summary: "Sync incident data to Google Sheets",
    request: {
      body: {
        content: {
          "application/json": {
            schema: GoogleSheetsSyncSchema,
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Data synced successfully",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              spreadsheetId: z.string(),
              range: z.string(),
              updatedRows: z.number(),
            }),
          },
        },
      },
    },
  };

  async handle(c: HandleArgs[0]) {
    try {
      const body = await c.req.json();
      const { incidentData } = GoogleSheetsSyncSchema.parse(body);

      // Get access token using service account
      const accessToken = await this.getAccessToken(c.env);

      // Get or create spreadsheet
      const spreadsheetId = await this.getOrCreateSpreadsheet(accessToken, c.env.GOOGLE_SPREADSHEET_ID);

      // Prepare row data
      const rowData = [
        incidentData.id,
        incidentData.tanggal,
        incidentData.waktu,
        incidentData.lokasi,
        incidentData.deskripsi,
        incidentData.teknisi,
        incidentData.status,
        incidentData.prioritas,
        new Date().toISOString(), // timestamp
      ];

      // Append data to sheet
      const appendResponse = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [rowData],
        }),
      });

      if (!appendResponse.ok) {
        throw new Error(`Sheets append failed: ${appendResponse.status} ${appendResponse.statusText}`);
      }

      const result = await appendResponse.json();

      return c.json({
        success: true,
        spreadsheetId,
        updatedRange: result.updates?.updatedRange,
        updatedRows: result.updates?.updatedRows,
      });

    } catch (error) {
      console.error('Google Sheets sync error:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Sync failed',
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

  private async getOrCreateSpreadsheet(accessToken: string, spreadsheetId?: string): Promise<string> {
    if (spreadsheetId) {
      try {
        // Try to access existing spreadsheet
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        
        if (response.ok) {
          return spreadsheetId;
        }
      } catch (error) {
        console.log('Spreadsheet not found, creating new one');
      }
    }

    // Create new spreadsheet
    const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: `SPPD-LEMBUR-${new Date().getFullYear()}`,
        },
        sheets: [{
          properties: {
            title: 'Sheet1',
          },
          data: [{
            rowData: [{
              values: [
                { userEnteredValue: { stringValue: 'ID' } },
                { userEnteredValue: { stringValue: 'Tanggal' } },
                { userEnteredValue: { stringValue: 'Waktu' } },
                { userEnteredValue: { stringValue: 'Lokasi' } },
                { userEnteredValue: { stringValue: 'Deskripsi' } },
                { userEnteredValue: { stringValue: 'Teknisi' } },
                { userEnteredValue: { stringValue: 'Status' } },
                { userEnteredValue: { stringValue: 'Prioritas' } },
                { userEnteredValue: { stringValue: 'Timestamp' } },
              ],
            }],
          }],
        }],
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Spreadsheet creation failed: ${createResponse.status}`);
    }

    const result = await createResponse.json();
    return result.spreadsheetId;
  }
}