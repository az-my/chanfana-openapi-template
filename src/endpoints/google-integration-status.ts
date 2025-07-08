import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { google } from "googleapis";
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
    const timestamp = new Date().toISOString();
    const status = {
      success: true,
      googleDrive: { connected: false, error: undefined as string | undefined },
      googleSheets: { connected: false, spreadsheetId: undefined as string | undefined, error: undefined as string | undefined },
      timestamp,
    };

    try {
      // Check Google Drive connection
      try {
        const auth = new google.auth.GoogleAuth({
          credentials: {
            type: "service_account",
            project_id: c.env.GOOGLE_PROJECT_ID,
            private_key_id: c.env.GOOGLE_PRIVATE_KEY_ID,
            private_key: c.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            client_email: c.env.GOOGLE_CLIENT_EMAIL,
            client_id: c.env.GOOGLE_CLIENT_ID,
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(c.env.GOOGLE_CLIENT_EMAIL)}`
          },
          scopes: ['https://www.googleapis.com/auth/drive.file'],
        });

        const drive = google.drive({ version: 'v3', auth });
        
        // Test Drive API access
        await drive.files.list({
          pageSize: 1,
          fields: 'files(id, name)',
        });
        
        status.googleDrive.connected = true;
      } catch (error) {
        status.googleDrive.error = error instanceof Error ? error.message : 'Drive connection failed';
      }

      // Check Google Sheets connection
      try {
        const auth = new google.auth.GoogleAuth({
          credentials: {
            type: "service_account",
            project_id: c.env.GOOGLE_PROJECT_ID,
            private_key_id: c.env.GOOGLE_PRIVATE_KEY_ID,
            private_key: c.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            client_email: c.env.GOOGLE_CLIENT_EMAIL,
            client_id: c.env.GOOGLE_CLIENT_ID,
            auth_uri: "https://accounts.google.com/o/oauth2/auth",
            token_uri: "https://oauth2.googleapis.com/token",
            auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
            client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(c.env.GOOGLE_CLIENT_EMAIL)}`
          },
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = c.env.GOOGLE_SHEETS_ID;
        
        if (spreadsheetId) {
          // Test Sheets API access
          await sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'spreadsheetId,properties.title',
          });
          
          status.googleSheets.connected = true;
          status.googleSheets.spreadsheetId = spreadsheetId;
        } else {
          status.googleSheets.error = 'GOOGLE_SHEETS_ID environment variable not set';
        }
      } catch (error) {
        status.googleSheets.error = error instanceof Error ? error.message : 'Sheets connection failed';
      }

      // Overall success if at least one service is connected
      status.success = status.googleDrive.connected || status.googleSheets.connected;

      return c.json(status);

    } catch (error) {
      console.error('Google integration status check error:', error);
      return c.json(
        {
          success: false,
          googleDrive: { connected: false, error: 'Status check failed' },
          googleSheets: { connected: false, error: 'Status check failed' },
          timestamp,
          error: error instanceof Error ? error.message : 'Status check failed',
        },
        500
      );
    }
  }
}