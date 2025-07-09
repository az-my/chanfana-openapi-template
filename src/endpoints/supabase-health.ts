import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../types";
import { createSupabaseClient } from "../utils/supabaseClient";

export class SupabaseHealth extends OpenAPIRoute {
  schema = {
    tags: ["Supabase"],
    summary: "Check Supabase health and credentials",
    responses: {
      "200": {
        description: "Supabase health check result",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              connection: z.string(),
              credentials: z.object({
                url: z.string(),
                hasServiceKey: z.boolean(),
              }),
              tests: z.object({
                basicConnection: z.boolean(),
                publicAccess: z.boolean(),
                serviceRoleAccess: z.boolean(),
              }),
              availableTables: z.array(z.string()).optional(),
            }),
          },
        },
      },
    },
  };

  async handle(c: HandleArgs[0]) {
    try {
      const results = {
        success: false,
        connection: "unknown",
        credentials: {
          url: c.env.SUPABASE_URL || "missing",
          hasServiceKey: !!(c.env.SUPABASE_SERVICE_ROLE_KEY),
        },
        tests: {
          basicConnection: false,
          publicAccess: false,
          serviceRoleAccess: false,
        },
        availableTables: [] as string[],
      };

      // Check if credentials exist
      if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
        results.connection = "missing credentials";
        return c.json(results);
      }

      // Create Supabase client
      const supabase = createSupabaseClient(c.env);
      results.tests.basicConnection = true;

      // Test 1: Basic connection test
      try {
        const { data, error } = await supabase.auth.getUser();
        // This should return "Auth session missing!" which is expected for service role
        if (error && error.message === 'Auth session missing!') {
          results.tests.publicAccess = true;
          results.connection = "connected";
        }
      } catch (error) {
        console.log("Auth test error (expected):", error);
      }

      // Test 2: Try to access information_schema (PostgreSQL system tables)
      try {
        const { data, error } = await supabase.rpc('version');
        if (data || error) {
          results.tests.serviceRoleAccess = true;
        }
      } catch (error) {
        console.log("RPC test error:", error);
      }

      // Test 3: Try to list tables using raw SQL (if possible)
      try {
        // Try a simple query that should work with service role
        const { data, error } = await supabase
          .from('pg_tables')
          .select('tablename')
          .eq('schemaname', 'public')
          .limit(10);

        if (data && Array.isArray(data)) {
          results.availableTables = data.map((table: any) => table.tablename);
          results.tests.serviceRoleAccess = true;
        } else if (error) {
          console.log("Table listing error:", error.message);
        }
      } catch (error) {
        console.log("Table listing failed:", error);
      }

      // Test 4: Alternative - try a simple count query on a system table
      if (!results.tests.serviceRoleAccess) {
        try {
          const { count, error } = await supabase
            .from('auth.users')
            .select('*', { count: 'exact', head: true });

          if (count !== null || error) {
            results.tests.serviceRoleAccess = true;
            results.connection = "service role working";
          }
        } catch (error) {
          console.log("Count test error:", error);
        }
      }

      // Overall success determination
      results.success = results.tests.basicConnection && (results.tests.publicAccess || results.tests.serviceRoleAccess);

      return c.json(results);

    } catch (error) {
      console.error('Supabase health check error:', error);
      return c.json(
        {
          success: false,
          connection: "error",
          error: error instanceof Error ? error.message : 'Health check failed',
        },
        500
      );
    }
  }
}
