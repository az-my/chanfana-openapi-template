import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../types";
import { createSupabaseClient } from "../utils/supabaseClient";

export class SupabaseTest extends OpenAPIRoute {
  schema = {
    tags: ["Supabase"],
    summary: "Test Supabase connection",
    responses: {
      "200": {
        description: "Supabase connection test result",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
              connectionStatus: z.string().optional(),
            }),
          },
        },
      },
    },
  };

  async handle(c: HandleArgs[0]) {
    try {
      // Create Supabase client with environment variables
      const supabase = createSupabaseClient(c.env);
      
      // Simple connection test - try to get auth info
      const { data, error } = await supabase.auth.getUser();

      if (error && error.message !== 'Auth session missing!') {
        throw new Error(`Supabase error: ${error.message}`);
      }

      return c.json({
        success: true,
        message: "Supabase connection successful",
        connectionStatus: "Connected to Supabase",
      });

    } catch (error) {
      console.error('Supabase test error:', error);
      return c.json(
        {
          success: false,
          message: error instanceof Error ? error.message : 'Supabase test failed',
        },
        500
      );
    }
  }
}
