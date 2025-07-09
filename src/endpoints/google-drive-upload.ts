import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
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
              folderPath: z.string().optional(),
            }),
          },
        },
      },
    },
  };

  async handle(c: any) {
    try {
      console.log('Upload handler started');
      const env = c.env;
      
      console.log('Getting request data...');
      const requestData = await c.req.json();
      console.log('Request data received:', Object.keys(requestData));
      
      console.log('Parsing schema...');
      const { file, filename, incidentId, photoType } = GoogleDriveUploadSchema.parse(requestData);
      console.log('Schema parsed successfully');

      // Get access token using service account
      const accessToken = await this.getAccessToken(env);
      
      // Test basic Drive API access first
      const testResponse = await fetch('https://www.googleapis.com/drive/v3/files?pageSize=1', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        console.error('Drive API test failed:', errorText);
        throw new Error(`Drive API access failed: ${testResponse.status} - ${errorText}`);
      }
      
      console.log('Drive API access successful');
      
      // Convert base64 to buffer
      const buffer = Uint8Array.from(atob(file.split(',')[1]), c => c.charCodeAt(0));

      // For service accounts, we'll upload to a simple folder structure
      // without creating deep nested folders to avoid quota issues
      const rootFolderId = 'root';
      const simpleFilename = `${photoType}_${incidentId}_${filename}`;
      
      console.log('Uploading file:', simpleFilename);

      // Upload file using multipart upload
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;

      const metadata = {
        name: simpleFilename,
        parents: [rootFolderId],
      };

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: image/jpeg\r\n\r\n';

      const multipartRequestBodyBuffer = new TextEncoder().encode(multipartRequestBody);
      const closeDelimBuffer = new TextEncoder().encode(close_delim);

      const totalLength = multipartRequestBodyBuffer.length + buffer.length + closeDelimBuffer.length;
      const combinedBuffer = new Uint8Array(totalLength);
      combinedBuffer.set(multipartRequestBodyBuffer, 0);
      combinedBuffer.set(buffer, multipartRequestBodyBuffer.length);
      combinedBuffer.set(closeDelimBuffer, multipartRequestBodyBuffer.length + buffer.length);

      // Use both API key and Bearer token for authentication
      const apiUrl = env.GOOGLE_API_KEY 
        ? `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,webContentLink&key=${env.GOOGLE_API_KEY}`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,webContentLink`;
      
      const headers: Record<string, string> = {
        'Content-Type': `multipart/related; boundary="${boundary}"`,
        'Content-Length': totalLength.toString(),
        'Authorization': `Bearer ${accessToken}`,
      };
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: combinedBuffer,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload error details:', errorText);
        throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();

      return c.json({
        success: true,
        fileId: result.id,
        webViewLink: result.webViewLink,
        webContentLink: result.webContentLink,
        folderPath: 'root',
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

  private async getAccessToken(env: any): Promise<string> {
    // Always use JWT authentication to get proper access token
    // API keys alone cannot be used as Bearer tokens for Drive uploads
    const jwtHeader = {
      alg: 'RS256',
      typ: 'JWT',
      kid: env.GOOGLE_PRIVATE_KEY_ID,
    };

    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      iss: env.GOOGLE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file',
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

  private async getOrCreateFolder(accessToken: string, path: string, rootFolderId: string): Promise<string> {
    const pathParts = path.split('/');
    let currentParentId = rootFolderId;

    for (const part of pathParts) {
      // Check if folder exists
      const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${part}' and '${currentParentId}' in parents and mimeType='application/vnd.google-apps.folder'&fields=files(id)`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!searchResponse.ok) {
        throw new Error(`Failed to search for folder '${part}': ${searchResponse.status}`);
      }

      const searchResult = await searchResponse.json();
      let folderId = searchResult.files.length > 0 ? searchResult.files[0].id : null;

      // If folder does not exist, create it
      if (!folderId) {
        const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: part,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [currentParentId],
          }),
        });

        if (!createResponse.ok) {
          throw new Error(`Failed to create folder '${part}': ${createResponse.status}`);
        }

        const createResult = await createResponse.json();
        folderId = createResult.id;
      }
      currentParentId = folderId;
    }
    return currentParentId;
  }

  private async getOrCreateSharedDrive(accessToken: string, driveName: string): Promise<string> {
    // Search for existing shared drive
    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/drives?q=name='${encodeURIComponent(driveName)}'`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Shared drive search error:', errorText);
      throw new Error(`Shared drive search failed: ${searchResponse.status} - ${errorText}`);
    }

    const searchResult = await searchResponse.json();
    
    if (searchResult.drives && searchResult.drives.length > 0) {
      return searchResult.drives[0].id;
    }

    // Create new shared drive
    const requestId = `sppd-${Date.now()}`;
    const createResponse = await fetch(
      `https://www.googleapis.com/drive/v3/drives?requestId=${requestId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: driveName,
        }),
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Shared drive creation error:', errorText);
      throw new Error(`Shared drive creation failed: ${createResponse.status} - ${errorText}`);
    }

    const createResult = await createResponse.json();
    return createResult.id;
  }


}