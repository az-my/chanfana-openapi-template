import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../types";
import { createSupabaseClient } from "../utils/supabaseClient";

export class SupabaseSimpleTest extends OpenAPIRoute {
  schema = {
    tags: ["Supabase"],
    summary: "Simple Supabase operations test",
    responses: {
      "200": {
        description: "Simple test results",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              tests: z.object({
                createTable: z.boolean(),
                insertData: z.boolean(),
                selectData: z.boolean(),
              }),
              data: z.any().optional(),
              message: z.string(),
            }),
          },
        },
      },
    },
  };

  async handle(c: HandleArgs[0]) {
    try {
      const supabase = createSupabaseClient(c.env);
      
      const results = {
        success: false,
        tests: {
          createTable: false,
          insertData: false,
          selectData: false,
        },
        data: null as any,
        message: "",
      };

      // Test 1: Try to create a simple test table
      try {
        // Use RPC to execute raw SQL for table creation
        const { data, error } = await supabase.rpc('exec_sql', {
          sql: `
            CREATE TABLE IF NOT EXISTS test_simple (
              id SERIAL PRIMARY KEY,
              name TEXT,
              created_at TIMESTAMP DEFAULT NOW()
            );
          `
        });
        
        if (!error) {
          results.tests.createTable = true;
        } else {
          console.log("Create table error:", error.message);
        }
      } catch (error) {
        console.log("Create table failed:", error);
        // This is expected if RPC doesn't exist, let's try direct table operations
      }

      // Test 2: Try to insert data (this will also test if table exists)
      try {
        const { data, error } = await supabase
          .from('test_simple')
          .insert([
            { name: 'Test Entry 1' },
            { name: 'Test Entry 2' }
          ])
          .select();

        if (!error && data) {
          results.tests.insertData = true;
          results.data = data;
        } else {
          console.log("Insert error:", error?.message);
        }
      } catch (error) {
        console.log("Insert failed:", error);
      }

      // Test 3: Try to select data
      try {
        const { data, error } = await supabase
          .from('test_simple')
          .select('*')
          .limit(5);

        if (!error && data) {
          results.tests.selectData = true;
          if (!results.data) results.data = data;
        } else {
          console.log("Select error:", error?.message);
        }
      } catch (error) {
        console.log("Select failed:", error);
      }

      // Determine overall success
      results.success = results.tests.selectData || results.tests.insertData;
      
      if (results.success) {
        results.message = "Supabase operations working! Ready for full integration.";
      } else {
        results.message = "Supabase connected but may need table setup or different permissions.";
      }

      return c.json(results);

    } catch (error) {
      console.error('Supabase simple test error:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Simple test failed',
        },
        500
      );
    }
  }
}
