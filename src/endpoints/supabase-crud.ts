import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { HandleArgs } from "../types";
import { createSupabaseClient } from "../utils/supabaseClient";

const SupabaseCrudSchema = z.object({
  operation: z.enum(["select", "insert", "update", "delete"]),
  table: z.string().describe("Table name"),
  data: z.any().optional().describe("Data for insert/update operations"),
  where: z.record(z.any()).optional().describe("Where conditions for select/update/delete"),
  columns: z.string().optional().describe("Columns to select (default: '*')"),
});

export class SupabaseCrud extends OpenAPIRoute {
  schema = {
    tags: ["Supabase"],
    summary: "Perform CRUD operations on Supabase tables",
    request: {
      body: {
        content: {
          "application/json": {
            schema: SupabaseCrudSchema,
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Operation completed successfully",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              operation: z.string(),
              table: z.string(),
              data: z.any().optional(),
              count: z.number().optional(),
            }),
          },
        },
      },
    },
  };

  async handle(c: HandleArgs[0]) {
    try {
      const body = await c.req.json();
      const { operation, table, data, where, columns = '*' } = SupabaseCrudSchema.parse(body);

      // Create Supabase client
      const supabase = createSupabaseClient(c.env);

      let result;
      
      switch (operation) {
        case 'select':
          result = await this.performSelect(supabase, table, columns, where);
          break;
        case 'insert':
          result = await this.performInsert(supabase, table, data);
          break;
        case 'update':
          result = await this.performUpdate(supabase, table, data, where);
          break;
        case 'delete':
          result = await this.performDelete(supabase, table, where);
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }

      return c.json({
        success: true,
        operation,
        table,
        data: result.data,
        count: result.count || (result.data ? result.data.length : 0),
      });

    } catch (error) {
      console.error('Supabase CRUD error:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Operation failed',
        },
        500
      );
    }
  }

  private async performSelect(supabase: any, table: string, columns: string, where?: any) {
    let query = supabase.from(table).select(columns);
    
    if (where) {
      Object.entries(where).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }

    const { data, error } = await query;
    if (error) throw new Error(`Select failed: ${error.message}`);
    
    return { data, count: data?.length || 0 };
  }

  private async performInsert(supabase: any, table: string, data: any) {
    const { data: result, error } = await supabase
      .from(table)
      .insert(data)
      .select();

    if (error) throw new Error(`Insert failed: ${error.message}`);
    
    return { data: result };
  }

  private async performUpdate(supabase: any, table: string, data: any, where?: any) {
    let query = supabase.from(table).update(data);
    
    if (where) {
      Object.entries(where).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }

    const { data: result, error } = await query.select();
    if (error) throw new Error(`Update failed: ${error.message}`);
    
    return { data: result };
  }

  private async performDelete(supabase: any, table: string, where?: any) {
    let query = supabase.from(table).delete();
    
    if (where) {
      Object.entries(where).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    } else {
      throw new Error("Delete operation requires where conditions for safety");
    }

    const { data: result, error } = await query.select();
    if (error) throw new Error(`Delete failed: ${error.message}`);
    
    return { data: result };
  }
}
