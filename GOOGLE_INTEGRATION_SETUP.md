# 🔗 Google Drive & Sheets Integration Setup Guide

## Overview

This guide will help you set up Google Drive photo uploads and Google Sheets data synchronization for the V3-SPPD-LEMBUR incident reporting system.

## Prerequisites

1. Google Cloud Platform account
2. Cloudflare Workers account
3. Access to Google Drive and Google Sheets

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your **Project ID** (you'll need this later)

## Step 2: Enable Required APIs

1. In Google Cloud Console, go to **APIs & Services > Library**
2. Enable the following APIs:
   - **Google Drive API**
   - **Google Sheets API**

## Step 3: Create Service Account

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > Service Account**
3. Fill in the details:
   - **Service account name**: `sppd-lembur-integration`
   - **Description**: `Service account for SPPD LEMBUR photo uploads and data sync`
4. Click **Create and Continue**
5. Skip role assignment for now (click **Continue**)
6. Click **Done**

## Step 4: Generate Service Account Key

1. Click on the created service account
2. Go to **Keys** tab
3. Click **Add Key > Create New Key**
4. Select **JSON** format
5. Download the JSON file
6. **Keep this file secure!**

## Step 5: Extract Credentials from JSON

Open the downloaded JSON file and extract these values:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "your-private-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "sppd-lembur-integration@your-project.iam.gserviceaccount.com",
  "client_id": "your-client-id"
}
```

## Step 6: Create Google Sheets Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com/)
2. Create a new spreadsheet
3. Name it: `SPPD LEMBUR - Incident Reports`
4. Copy the **Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
   ```

## Step 7: Share Resources with Service Account

### For Google Drive:
1. Create a folder named `SPPD-LEMBUR` in your Google Drive
2. Right-click the folder > **Share**
3. Add the service account email with **Editor** permissions
4. Click **Send**

### For Google Sheets:
1. Open your spreadsheet
2. Click **Share** button
3. Add the service account email with **Editor** permissions
4. Click **Send**

## Step 8: Update Cloudflare Worker Environment Variables

Update `wrangler.jsonc` with your actual values:

```jsonc
{
  "vars": {
    "ENVIRONMENT": "development",
    "SUPABASE_URL": "https://nwdqbfqfgndnusoqddrc.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "your-supabase-key",
    "GOOGLE_PROJECT_ID": "your-actual-project-id",
    "GOOGLE_PRIVATE_KEY_ID": "your-actual-private-key-id",
    "GOOGLE_PRIVATE_KEY": "-----BEGIN PRIVATE KEY-----\nyour-actual-private-key\n-----END PRIVATE KEY-----",
    "GOOGLE_CLIENT_EMAIL": "sppd-lembur-integration@your-project.iam.gserviceaccount.com",
    "GOOGLE_CLIENT_ID": "your-actual-client-id",
    "GOOGLE_SHEETS_ID": "your-actual-spreadsheet-id"
  }
}
```

**Important Notes:**
- Replace all `your-actual-*` values with real credentials
- For `GOOGLE_PRIVATE_KEY`, ensure line breaks are properly escaped as `\n`
- Never commit real credentials to version control

## Step 9: Install Dependencies and Deploy

```bash
cd g:\V3-SPPD-LEMBUR-WORKER

# Install new dependencies
npm install

# Deploy to Cloudflare Workers
npm run deploy
```

## Step 10: Test the Integration

### Test API Health:
```bash
curl https://your-worker-url.workers.dev/api/google/status
```

### Expected Response:
```json
{
  "success": true,
  "googleDrive": {
    "connected": true
  },
  "googleSheets": {
    "connected": true,
    "spreadsheetId": "your-spreadsheet-id"
  },
  "timestamp": "2024-01-20T10:30:00.000Z"
}
```

## API Endpoints

### 1. Upload Photo to Google Drive
```
POST /api/google-drive/upload
Content-Type: application/json

{
  "file": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD...",
  "filename": "incident_photo_20240120_103000.jpg",
  "incidentId": "incident-123",
  "photoType": "odo_awal"
}
```

### 2. Sync Data to Google Sheets
```
POST /api/google-sheets/sync
Content-Type: application/json

{
  "incidentData": {
    "id": "incident-123",
    "tanggal": "2024-01-20",
    "jam_mulai": "10:30",
    "lokasi": "Jakarta Pusat",
    "deskripsi": "Maintenance rutin",
    "status": "selesai",
    "teknisi_nama": "John Doe"
  }
}
```

### 3. Check Integration Status
```
GET /api/google/status
```

## Folder Structure in Google Drive

Photos will be organized as:
```
SPPD-LEMBUR/
├── 2024/
│   ├── 01/
│   │   ├── incident-123/
│   │   │   ├── odo_awal_photo1.jpg
│   │   │   ├── tim_awal_photo2.jpg
│   │   │   └── ...
│   │   └── incident-124/
│   └── 02/
└── 2025/
```

## Google Sheets Structure

Each month gets its own sheet (e.g., "Januari 2024") with columns:
- ID Insiden
- Tanggal
- Jam Mulai
- Jam Selesai
- Durasi
- Lokasi
- Deskripsi
- Status
- Teknisi
- Foto Odo Awal (Ya/Tidak)
- Foto Tim Awal (Ya/Tidak)
- Foto Odo Akhir (Ya/Tidak)
- Foto Tim Akhir (Ya/Tidak)
- Dibuat
- Diperbarui

## Security Best Practices

1. **Never commit credentials to Git**
2. **Use environment variables for production**
3. **Regularly rotate service account keys**
4. **Monitor API usage in Google Cloud Console**
5. **Set up proper IAM permissions**

## Troubleshooting

### Common Issues:

1. **"Invalid credentials" error**
   - Check if service account email is correct
   - Verify private key format (ensure proper line breaks)
   - Confirm APIs are enabled

2. **"Permission denied" error**
   - Ensure service account has access to Drive folder/Sheets
   - Check sharing permissions

3. **"Spreadsheet not found" error**
   - Verify GOOGLE_SHEETS_ID is correct
   - Ensure service account has access to the spreadsheet

### Debug Steps:
1. Test `/api/google/status` endpoint first
2. Check Cloudflare Workers logs
3. Verify environment variables are set correctly
4. Test with a simple API call

## Production Deployment

For production:
1. Create a separate Google Cloud project
2. Use Cloudflare Workers secrets instead of environment variables
3. Set up monitoring and alerting
4. Configure proper backup strategies

---

🎯 **Your Google integration is now ready!** The system will automatically upload photos to Google Drive and sync incident data to Google Sheets.