import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { google } from "googleapis";
import { HandleArgs } from "../types";

const GoogleDriveUploadSchema = z.object({
  file: z.string().describe("Base64 encoded image file"),
  filename: z.string().describe("Name of the file"),
  incidentId: z.string().describe("Incident ID for organization"),
  photoType: z.string().describe("Type of photo (odo_awal, tim_awal, etc.)"),
});

export class GoogleDriveUpload extends OpenAPIRoute {
  schema = {
    tags: ["Google Drive"],
    summary: "Upload photo to Google Drive",
    request: {
      body: {
        content: {
          "application/json": {
            schema: GoogleDriveUploadSchema,
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Photo uploaded successfully",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              fileId: z.string(),
              webViewLink: z.string(),
              webContentLink: z.string(),
            }),
          },
        },
      },
    },
  };

  async handle(c: HandleArgs[0]) {
    try {
      const body = await c.req.json();
      const { file, filename, incidentId, photoType } = GoogleDriveUploadSchema.parse(body);

      // Initialize Google Drive API
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

      // Convert base64 to buffer
      const buffer = Uint8Array.from(atob(file.split(',')[1]), c => c.charCodeAt(0));

      // Create folder structure: SPPD-LEMBUR/YYYY/MM/incident-{incidentId}
      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      
      const rootFolderId = await this.getOrCreateFolder(drive, 'SPPD-LEMBUR', 'root');
      const yearFolderId = await this.getOrCreateFolder(drive, year, rootFolderId);
      const monthFolderId = await this.getOrCreateFolder(drive, month, yearFolderId);
      const incidentFolderId = await this.getOrCreateFolder(drive, `incident-${incidentId}`, monthFolderId);

      // Upload file
      const fileMetadata = {
        name: `${photoType}_${filename}`,
        parents: [incidentFolderId],
      };

      const media = {
        mimeType: 'image/jpeg',
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(buffer);
            controller.close();
          }
        })
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id,webViewLink,webContentLink',
      });

      return c.json({
        success: true,
        fileId: response.data.id,
        webViewLink: response.data.webViewLink,
        webContentLink: response.data.webContentLink,
      });

    } catch (error) {
      console.error('Google Drive upload error:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed',
        },
        500
      );
    }
  }

  private async getOrCreateFolder(drive: any, name: string, parentId: string): Promise<string> {
    // Search for existing folder
    const searchResponse = await drive.files.list({
      q: `name='${name}' and parents in '${parentId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      return searchResponse.data.files[0].id;
    }

    // Create new folder
    const folderMetadata = {
      name: name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    };

    const folderResponse = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id',
    });

    return folderResponse.data.id;
  }
}