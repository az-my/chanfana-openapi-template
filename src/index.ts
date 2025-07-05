import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { tasksRouter } from "./endpoints/tasks/router";
import { ContentfulStatusCode } from "hono/utils/http-status";
import { DummyEndpoint } from "./endpoints/dummyEndpoint";

// Import our new admin endpoints
import { AdminGetUsers } from "./endpoints/admin-get-users";
import { AdminCreateUser } from "./endpoints/admin-create-user";
import { AdminDeleteUser } from "./endpoints/admin-delete-user";
import { HealthCheck } from "./endpoints/health-check";

// Start a Hono app
const app = new Hono<{ Bindings: Env }>();

// Add CORS middleware for your frontend
app.use('*', cors({
  origin: [
    'http://localhost:3000', 
    'http://localhost:5173', // Vite dev server
    'http://localhost:5174', // Alternative Vite port
    'https://yourdomain.com', // Replace with your production domain
    // Add your Vercel/Netlify deployment URLs here
  ],
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
openapi.post("/dummy/:slug", DummyEndpoint);

// Register new admin endpoints
openapi.get("/api/health", HealthCheck);
openapi.get("/api/admin/users", AdminGetUsers);
openapi.post("/api/admin/users", AdminCreateUser);
openapi.delete("/api/admin/users/:userId", AdminDeleteUser);

// Export the Hono app
export default app;
