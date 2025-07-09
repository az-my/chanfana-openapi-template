# 🧪 Google Integration Testing Guide

## Overview

This guide provides comprehensive testing instructions for the Google Drive and Sheets integration in your V3-SPPD-LEMBUR application.

## Prerequisites

1. ✅ Google Cloud Project setup completed
2. ✅ Service Account created with proper permissions
3. ✅ Environment variables configured in Cloudflare Workers
4. ✅ Dependencies installed (`npm install`)
5. ✅ Worker deployed (`wrangler deploy`)

## 🔧 Backend API Testing

### 1. Test Environment Setup

```bash
# Install dependencies
npm install

# Deploy to Cloudflare Workers
wrangler deploy

# Check deployment status
wrangler tail
```

### 2. Test Google Integration Status

```bash
# Test the status endpoint
curl -X GET "https://your-worker-url.workers.dev/api/google/status" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "googleDrive": {
    "connected": true,
    "lastChecked": "2024-01-20T10:30:00.000Z"
  },
  "googleSheets": {
    "connected": true,
    "lastChecked": "2024-01-20T10:30:00.000Z"
  }
}
```

### 3. Test Google Drive Upload

```bash
# Test photo upload
curl -X POST "https://your-worker-url.workers.dev/api/google-drive/upload" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "incidentId": "test-incident-123",
    "photoType": "odo_awal",
    "base64Data": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
    "filename": "test_photo.jpg"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "fileId": "1ABC123xyz...",
  "webViewLink": "https://drive.google.com/file/d/1ABC123xyz.../view",
  "folderPath": "SPPD-LEMBUR/2024/01/incident-test-incident-123"
}
```

### 4. Test Google Sheets Sync

```bash
# Test data sync
curl -X POST "https://your-worker-url.workers.dev/api/google-sheets/sync" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "incidentData": {
      "id": "test-incident-123",
      "tanggal": "2024-01-20",
      "jam_mulai": "08:00",
      "jam_selesai": "17:00",
      "durasi": "9 jam",
      "lokasi": "Jakarta Pusat",
      "deskripsi": "Test incident for integration",
      "status": "completed",
      "teknisi": "John Doe",
      "foto_odo_awal": "Ya",
      "foto_tim_awal": "Ya",
      "foto_odo_akhir": "Tidak",
      "foto_tim_akhir": "Tidak",
      "created_at": "2024-01-20T08:00:00.000Z",
      "updated_at": "2024-01-20T17:00:00.000Z"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "sheetName": "2024-01",
  "rowNumber": 2,
  "action": "inserted"
}
```

## 🎨 Frontend Integration Testing

### 1. Environment Setup

```bash
# Navigate to frontend directory
cd FRONTEND_CODE

# Install dependencies
npm install

# Start development server
npm run dev
```

### 2. Test Camera Component with Google Upload

Create a test page to verify the enhanced `CameraPhotoCapture` component:

```tsx
// src/pages/TestGoogleIntegration.tsx
import React, { useState } from 'react';
import CameraPhotoCapture from '@/features/teknisi/components/CameraPhotoCapture';
import { googleIntegrationApi } from '@/lib/googleIntegrationApi';

const TestGoogleIntegration = () => {
  const [photo, setPhoto] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [incidentId] = useState(`test-${Date.now()}`);

  const checkStatus = async () => {
    try {
      const result = await googleIntegrationApi.getIntegrationStatus();
      setStatus(result);
    } catch (error) {
      console.error('Status check failed:', error);
    }
  };

  const handleUploadComplete = (result: any) => {
    console.log('Upload result:', result);
    if (result.success) {
      alert(`Photo uploaded successfully!\nGoogle Drive Link: ${result.webViewLink}`);
    } else {
      alert(`Upload failed: ${result.error}`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Google Integration Test</h1>
      
      {/* Status Check */}
      <div className="border p-4 rounded">
        <h2 className="text-lg font-semibold mb-2">Integration Status</h2>
        <button 
          onClick={checkStatus}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Check Status
        </button>
        {status && (
          <pre className="mt-2 p-2 bg-gray-100 rounded text-sm">
            {JSON.stringify(status, null, 2)}
          </pre>
        )}
      </div>

      {/* Camera Test */}
      <div className="border p-4 rounded">
        <h2 className="text-lg font-semibold mb-2">Camera with Google Upload</h2>
        <p className="text-sm text-gray-600 mb-4">Incident ID: {incidentId}</p>
        
        <CameraPhotoCapture
          label="Test Photo with Auto Upload"
          base64Data={photo}
          onChange={setPhoto}
          autoUploadToDrive={true}
          incidentId={incidentId}
          photoType="test_photo"
          onUploadComplete={handleUploadComplete}
        />
      </div>
    </div>
  );
};

export default TestGoogleIntegration;
```

### 3. Manual API Testing

Create a test utility to manually test API functions:

```tsx
// src/utils/testGoogleApi.ts
import { googleIntegrationApi } from '@/lib/googleIntegrationApi';

export const testGoogleIntegration = {
  async testStatus() {
    console.log('Testing Google integration status...');
    try {
      const result = await googleIntegrationApi.getIntegrationStatus();
      console.log('✅ Status check successful:', result);
      return result;
    } catch (error) {
      console.error('❌ Status check failed:', error);
      throw error;
    }
  },

  async testPhotoUpload() {
    console.log('Testing photo upload...');
    
    // Create a simple test image (1x1 pixel red)
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, 1, 1);
    const testImageData = canvas.toDataURL('image/jpeg');
    
    try {
      const result = await googleIntegrationApi.uploadWatermarkedPhoto(
        testImageData,
        `test-incident-${Date.now()}`,
        'test_photo'
      );
      console.log('✅ Photo upload successful:', result);
      return result;
    } catch (error) {
      console.error('❌ Photo upload failed:', error);
      throw error;
    }
  },

  async testSheetsSync() {
    console.log('Testing Google Sheets sync...');
    
    const testData = {
      id: `test-incident-${Date.now()}`,
      tanggal: new Date().toISOString().split('T')[0],
      jam_mulai: '08:00',
      jam_selesai: '17:00',
      durasi: '9 jam',
      lokasi: 'Test Location',
      deskripsi: 'Test incident for API testing',
      status: 'completed',
      teknisi: 'Test User',
      foto_odo_awal: 'Ya',
      foto_tim_awal: 'Ya',
      foto_odo_akhir: 'Tidak',
      foto_tim_akhir: 'Tidak',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    try {
      const result = await googleIntegrationApi.syncToGoogleSheets(testData);
      console.log('✅ Sheets sync successful:', result);
      return result;
    } catch (error) {
      console.error('❌ Sheets sync failed:', error);
      throw error;
    }
  },

  async runAllTests() {
    console.log('🧪 Running all Google integration tests...');
    
    try {
      await this.testStatus();
      await this.testPhotoUpload();
      await this.testSheetsSync();
      console.log('🎉 All tests passed!');
    } catch (error) {
      console.error('💥 Test suite failed:', error);
    }
  }
};

// Usage in browser console:
// import { testGoogleIntegration } from '@/utils/testGoogleApi';
// testGoogleIntegration.runAllTests();
```

## 🔍 Testing Checklist

### Backend Tests
- [ ] **Environment Variables**: All Google API credentials are set
- [ ] **Authentication**: JWT token validation works
- [ ] **Google Drive**: Status endpoint returns connected
- [ ] **Google Sheets**: Status endpoint returns connected
- [ ] **Photo Upload**: Files upload to correct folder structure
- [ ] **Data Sync**: Incident data syncs to correct monthly sheet
- [ ] **Error Handling**: Proper error responses for invalid requests
- [ ] **Rate Limiting**: API handles multiple requests appropriately

### Frontend Tests
- [ ] **API Service**: All methods in `googleIntegrationApi` work
- [ ] **Camera Component**: Auto-upload functionality works
- [ ] **Status Indicators**: Upload progress shows correctly
- [ ] **Error Handling**: Failed uploads show error messages
- [ ] **User Feedback**: Success/failure notifications appear
- [ ] **Fallback**: Component works without Google integration

### Integration Tests
- [ ] **End-to-End**: Photo capture → watermark → upload → sheets sync
- [ ] **Network Failures**: Graceful handling of network issues
- [ ] **Large Files**: Proper handling of file size limits
- [ ] **Concurrent Uploads**: Multiple simultaneous uploads work
- [ ] **Mobile Compatibility**: Works on mobile devices

## 🐛 Common Issues & Solutions

### Issue: "Authentication failed"
**Solution:**
```bash
# Check environment variables
wrangler secret list

# Verify service account key format
echo $GOOGLE_PRIVATE_KEY | base64 -d
```

### Issue: "Folder not found"
**Solution:**
- Ensure the service account has access to the parent folder
- Check folder creation permissions in Google Drive

### Issue: "Sheets permission denied"
**Solution:**
- Share the Google Sheet with the service account email
- Verify the `GOOGLE_SHEETS_ID` environment variable

### Issue: "File too large"
**Solution:**
```typescript
// Add file size validation
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
if (base64Data.length > MAX_SIZE) {
  throw new Error('File too large');
}
```

### Issue: "CORS errors"
**Solution:**
```typescript
// Ensure CORS headers are set in worker
response.headers.set('Access-Control-Allow-Origin', '*');
response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
```

## 📊 Performance Testing

### Load Testing
```bash
# Install artillery for load testing
npm install -g artillery

# Create load test config
cat > load-test.yml << EOF
config:
  target: 'https://your-worker-url.workers.dev'
  phases:
    - duration: 60
      arrivalRate: 5
scenarios:
  - name: 'Test Google endpoints'
    requests:
      - get:
          url: '/api/google/status'
          headers:
            Authorization: 'Bearer YOUR_TOKEN'
EOF

# Run load test
artillery run load-test.yml
```

### Memory Usage
```typescript
// Monitor memory usage in worker
const memoryUsage = () => {
  if (typeof performance !== 'undefined' && performance.memory) {
    console.log('Memory usage:', {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB',
      limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) + 'MB'
    });
  }
};
```

## 🚀 Production Testing

### Pre-deployment Checklist
- [ ] All tests pass in staging environment
- [ ] Google API quotas are sufficient for expected load
- [ ] Error monitoring is configured
- [ ] Backup procedures are in place
- [ ] Documentation is updated

### Post-deployment Verification
- [ ] Health checks pass
- [ ] Real user testing completed
- [ ] Performance metrics are within acceptable ranges
- [ ] Error rates are minimal

---

🎯 **Your Google integration is ready for testing!** Follow this guide systematically to ensure everything works correctly before production deployment.