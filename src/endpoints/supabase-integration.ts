import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../types";
import { createClient } from "@supabase/supabase-js";

const SupabaseIntegrationSchema = z.object({
  incidentId: z.string(),
  action: z.enum(["sync", "status", "upload"]),
  data: z.any().optional(),
});

export class SupabaseIntegration extends OpenAPIRoute {
  schema = {
    tags: ["Supabase Integration"],
    summary: "Handle Supabase integration with Google services",
    request: {
      body: {
        content: {
          "application/json": {
            schema: SupabaseIntegrationSchema,
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Integration completed successfully",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              action: z.string(),
              result: z.any().optional(),
              error: z.string().optional(),
            }),
          },
        },
      },
    },
  };

  async handle(c: HandleArgs[0]) {
    try {
      const { incidentId, action, data } = await c.req.json();
      
      // Initialize Supabase client
      const supabase = createClient(
        c.env.SUPABASE_URL,
        c.env.SUPABASE_KEY
      );

      // Handle different actions
      switch (action) {
        case "sync":
          // Sync data to Google Sheets via Supabase
          const syncResult = await this.handleSync(supabase, incidentId, data);
          return c.json({
            success: true,
            action: "sync",
            result: syncResult,
          });

        case "upload":
          // Upload files to Google Drive via Supabase
          const uploadResult = await this.handleUpload(supabase, incidentId, data);
          return c.json({
            success: true,
            action: "upload",
            result: uploadResult,
          });

        case "status":
          // Check integration status
          const statusResult = await this.handleStatus(supabase, incidentId);
          return c.json({
            success: true,
            action: "status",
            result: statusResult,
          });

        default:
          throw new Error(`Unsupported action: ${action}`);
      }

    } catch (error) {
      console.error('Supabase integration error:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Integration failed',
        },
        500
      );
    }
  }

  private async handleSync(supabase: any, incidentId: string, data: any) {
    // Get incident data from Supabase
    const { data: incident, error } = await supabase
      .from('incidents')
      .select('*')
      .eq('id', incidentId)
      .single();

    if (error) throw error;

    // Format data for Google Sheets
    const sheetsData = {
      id: incident.id,
      tanggal: incident.date,
      waktu: incident.time,
      lokasi: incident.location,
      deskripsi: incident.description,
      teknisi: incident.technician,
      status: incident.status,
      prioritas: incident.priority,
    };

    // Call Google Sheets sync endpoint
    const response = await fetch('http://localhost:8787/api/google-sheets/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        incidentData: sheetsData,
      }),
    });

    if (!response.ok) {
      throw new Error(`Sheets sync failed: ${response.status}`);
    }

    return await response.json();
  }

  private async handleUpload(supabase: any, incidentId: string, data: any) {
    // Upload files to Google Drive
    const response = await fetch('http://localhost:8787/api/google-drive/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: data.file,
        filename: data.filename,
        incidentId,
        photoType: data.photoType,
      }),
    });

    if (!response.ok) {
      throw new Error(`Drive upload failed: ${response.status}`);
    }

    return await response.json();
  }

  private async handleStatus(supabase: any, incidentId: string) {
    // Check integration status
    const response = await fetch('http://localhost:8787/api/google/status', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }

    return await response.json();
  }
}