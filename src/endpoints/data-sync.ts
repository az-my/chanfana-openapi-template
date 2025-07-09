import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../types";
import { createSupabaseClient } from "../utils/supabaseClient";

const DataSyncSchema = z.object({
  direction: z.enum(["supabase-to-sheets", "sheets-to-supabase"]),
  tableName: z.string().describe("Supabase table name"),
  sheetName: z.string().describe("Google Sheets sheet name"),
});

export class DataSync extends OpenAPIRoute {
  schema = {
    tags: ["Data Sync"],
    summary: "Sync data between Supabase and Google Sheets",
    request: {
      body: {
        content: {
          "application/json": {
            schema: DataSyncSchema,
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Data sync completed",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              direction: z.string(),
              recordsProcessed: z.number(),
              message: z.string(),
            }),
          },
        },
      },
    },
  };

  async handle(c: HandleArgs[0]) {
    try {
      const body = await c.req.json();
      const { direction, tableName, sheetName } = DataSyncSchema.parse(body);

      if (direction === "supabase-to-sheets") {
        return await this.syncSupabaseToSheets(c, tableName, sheetName);
      } else {
        return await this.syncSheetsToSupabase(c, tableName, sheetName);
      }

    } catch (error) {
      console.error('Data sync error:', error);
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Data sync failed',
        },
        500
      );
    }
  }

  private async syncSupabaseToSheets(c: HandleArgs[0], tableName: string, sheetName: string) {
    // Create Supabase client with environment variables
    const supabase = createSupabaseClient(c.env);
    
    // Get data from Supabase
    const { data, error } = await supabase
      .from(tableName)
      .select('*');

    if (error) {
      throw new Error(`Failed to fetch from Supabase: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return c.json({
        success: true,
        direction: "supabase-to-sheets",
        recordsProcessed: 0,
        message: "No data to sync",
      });
    }

    // Convert data to 2D array for Google Sheets
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(header => {
      const value = row[header] || '';
      // Truncate values that are too long for Google Sheets (50k character limit)
      if (typeof value === 'string' && value.length > 45000) {
        return value.substring(0, 45000) + '...[TRUNCATED]';
      }
      return value;
    }));
    
    // Get access token for Google Sheets
    const accessToken = await this.getAccessToken(c.env);
    const spreadsheetId = c.env.GOOGLE_SPREADSHEET_ID;

    // Append data directly to Google Sheets
    const appendResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [headers, ...rows],
        }),
      }
    );

    if (!appendResponse.ok) {
      const errorText = await appendResponse.text();
      throw new Error(`Failed to sync to Google Sheets: ${appendResponse.status} - ${errorText}`);
    }

    return c.json({
      success: true,
      direction: "supabase-to-sheets",
      recordsProcessed: data.length,
      message: `Successfully synced ${data.length} records to ${sheetName}`,
    });
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

  private async syncSheetsToSupabase(c: HandleArgs[0], tableName: string, sheetName: string) {
    // This would require implementing Google Sheets read functionality
    // For now, return a placeholder
    return c.json({
      success: false,
      direction: "sheets-to-supabase", 
      recordsProcessed: 0,
      message: "Sheets to Supabase sync not implemented yet",
    });
  }
}
