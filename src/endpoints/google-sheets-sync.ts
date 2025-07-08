import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { google } from "googleapis";
import { HandleArgs } from "../types";

const GoogleSheetsSyncSchema = z.object({
  incidentData: z.object({
    id: z.string(),
    tanggal: z.string(),
    jam_mulai: z.string(),
    jam_selesai: z.string().optional(),
    durasi: z.string().optional(),
    lokasi: z.string(),
    deskripsi: z.string(),
    status: z.string(),
    teknisi_id: z.string(),
    teknisi_nama: z.string(),
    foto_odo_awal: z.string().optional(),
    foto_tim_awal: z.string().optional(),
    foto_odo_akhir: z.string().optional(),
    foto_tim_akhir: z.string().optional(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
  spreadsheetId: z.string().optional().describe("Google Sheets ID (optional, will use default if not provided)"),
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
      const { incidentData, spreadsheetId } = GoogleSheetsSyncSchema.parse(body);

      // Initialize Google Sheets API
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
      const targetSpreadsheetId = spreadsheetId || c.env.GOOGLE_SHEETS_ID;

      // Get current month and year for sheet name
      const now = new Date();
      const monthNames = [
        'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
        'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
      ];
      const sheetName = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

      // Ensure sheet exists
      await this.ensureSheetExists(sheets, targetSpreadsheetId, sheetName);

      // Prepare row data
      const rowData = [
        incidentData.id,
        incidentData.tanggal,
        incidentData.jam_mulai,
        incidentData.jam_selesai || '',
        incidentData.durasi || '',
        incidentData.lokasi,
        incidentData.deskripsi,
        incidentData.status,
        incidentData.teknisi_nama,
        incidentData.foto_odo_awal ? 'Ya' : 'Tidak',
        incidentData.foto_tim_awal ? 'Ya' : 'Tidak',
        incidentData.foto_odo_akhir ? 'Ya' : 'Tidak',
        incidentData.foto_tim_akhir ? 'Ya' : 'Tidak',
        incidentData.created_at,
        incidentData.updated_at,
      ];

      // Check if incident already exists (update vs insert)
      const existingRowIndex = await this.findExistingRow(sheets, targetSpreadsheetId, sheetName, incidentData.id);
      
      let range: string;
      let updatedRows: number;

      if (existingRowIndex > 0) {
        // Update existing row
        range = `${sheetName}!A${existingRowIndex}:O${existingRowIndex}`;
        await sheets.spreadsheets.values.update({
          spreadsheetId: targetSpreadsheetId,
          range,
          valueInputOption: 'RAW',
          requestBody: {
            values: [rowData],
          },
        });
        updatedRows = 1;
      } else {
        // Append new row
        range = `${sheetName}!A:O`;
        const appendResponse = await sheets.spreadsheets.values.append({
          spreadsheetId: targetSpreadsheetId,
          range,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values: [rowData],
          },
        });
        updatedRows = appendResponse.data.updates?.updatedRows || 1;
      }

      return c.json({
        success: true,
        spreadsheetId: targetSpreadsheetId,
        range,
        updatedRows,
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

  private async ensureSheetExists(sheets: any, spreadsheetId: string, sheetName: string) {
    try {
      // Get spreadsheet metadata
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      // Check if sheet exists
      const sheetExists = spreadsheet.data.sheets?.some(
        (sheet: any) => sheet.properties?.title === sheetName
      );

      if (!sheetExists) {
        // Create new sheet
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetName,
                  },
                },
              },
            ],
          },
        });

        // Add headers
        const headers = [
          'ID Insiden',
          'Tanggal',
          'Jam Mulai',
          'Jam Selesai',
          'Durasi',
          'Lokasi',
          'Deskripsi',
          'Status',
          'Teknisi',
          'Foto Odo Awal',
          'Foto Tim Awal',
          'Foto Odo Akhir',
          'Foto Tim Akhir',
          'Dibuat',
          'Diperbarui',
        ];

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A1:O1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [headers],
          },
        });
      }
    } catch (error) {
      console.error('Error ensuring sheet exists:', error);
      throw error;
    }
  }

  private async findExistingRow(sheets: any, spreadsheetId: string, sheetName: string, incidentId: string): Promise<number> {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:A`,
      });

      const values = response.data.values;
      if (!values) return 0;

      for (let i = 0; i < values.length; i++) {
        if (values[i][0] === incidentId) {
          return i + 1; // Return 1-based row index
        }
      }

      return 0; // Not found
    } catch (error) {
      console.error('Error finding existing row:', error);
      return 0;
    }
  }
}