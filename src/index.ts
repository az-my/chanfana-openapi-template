import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { tasksRouter } from "./endpoints/tasks/router";
import { ContentfulStatusCode } from "hono/utils/http-status";

// Import our new admin endpoints
import { AdminGetUsers } from "./endpoints/admin-get-users";
import { AdminCreateUser } from "./endpoints/admin-create-user";
import { AdminDeleteUser } from "./endpoints/admin-delete-user";
import { HealthCheck } from "./endpoints/health-check";

// Import Google integration endpoints
import { GoogleDriveUpload } from "./endpoints/google-drive-upload";
import { GoogleSheetsSync } from "./endpoints/google-sheets-sync";
import { GoogleSheetsList } from "./endpoints/google-sheets-list";
import { GoogleSheetsAppend } from "./endpoints/google-sheets-append";
import { GoogleIntegrationStatus } from "./endpoints/google-integration-status";
import { GoogleTest } from "./endpoints/google-test";
import { GoogleDriveList } from "./endpoints/google-drive-list";
import { GoogleDriveCreateFolder } from "./endpoints/google-drive-create-folder";
import { GoogleSheetsRead } from "./endpoints/google-sheets-read";
import { SupabaseTest } from "./endpoints/supabase-test";
import { SupabaseHealth } from "./endpoints/supabase-health";
import { SupabaseSimpleTest } from "./endpoints/supabase-simple-test";
import { SupabaseCrud } from "./endpoints/supabase-crud";
import { DataSync } from "./endpoints/data-sync";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Add CORS middleware for your frontend - Allow all origins for development
app.use('*', cors({
  origin: '*', // Allow all origins
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

app.onError((err, c) => {
  if (err instanceof ApiException) {
    // If it's a Chanfana ApiException, let Chanfana handle the response
    return c.json(
      { success: false, errors: err.buildResponse() },
      err.status as ContentfulStatusCode,
    );
  }
  console.error("Global error handler caught:", err); // Log the error if it's not known
  // For other errors, return a generic 500 response
  return c.json(
    {
      success: false,
      errors: [{ code: 7000, message: "Internal Server Error" }],
    },
    500,
  );
});

// Setup OpenAPI registry
const openapi = fromHono(app, {
  docs_url: "/",
  schema: {
    info: {
      title: "V3 SPPD LEMBUR Admin API",
      version: "2.0.0",
      description: "Admin API for V3 SPPD LEMBUR system with RBAC user management.",
    },
  },
});

// Register existing endpoints
openapi.route("/tasks", tasksRouter);

// Register new admin endpoints
openapi.get("/api/health", HealthCheck);
openapi.get("/api/admin/users", AdminGetUsers);
openapi.post("/api/admin/users", AdminCreateUser);
openapi.delete("/api/admin/users/:userId", AdminDeleteUser);

// Register Google integration endpoints
openapi.post("/api/google-drive/upload", GoogleDriveUpload);
openapi.post("/api/google-sheets/sync", GoogleSheetsSync);
openapi.get("/api/google-sheets/list", GoogleSheetsList);
openapi.post("/api/google-sheets/append", GoogleSheetsAppend);
openapi.post("/api/google-sheets/read", GoogleSheetsRead);
openapi.get("/api/google/status", GoogleIntegrationStatus);
openapi.get("/api/google/test", GoogleTest);
openapi.get("/api/google-drive/list", GoogleDriveList);
openapi.post("/api/google-drive/create-folder", GoogleDriveCreateFolder);

// Register Supabase endpoints
openapi.get("/api/supabase/test", SupabaseTest);
openapi.get("/api/supabase/health", SupabaseHealth);
openapi.get("/api/supabase/simple-test", SupabaseSimpleTest);
openapi.post("/api/supabase/crud", SupabaseCrud);

// Register Data Sync endpoints
openapi.post("/api/data-sync", DataSync);

// Export the Hono app
export default app;
