import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "Boilerplate Admin API",
    version: "1.0.0",
    description: "REST API for the Boilerplate admin application.",
  },
  servers: [{ url: "/api", description: "Current server" }],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "bp_token",
        description: "JWT session cookie set on login",
      },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id:         { type: "integer" },
          email:      { type: "string", format: "email" },
          name:       { type: "string", nullable: true },
          role:       { type: "string", enum: ["user", "admin"] },
          status:     { type: "string", enum: ["pending", "approved", "rejected"] },
          created_at: { type: "string", format: "date-time" },
        },
      },
      AuditEntry: {
        type: "object",
        properties: {
          id:          { type: "integer" },
          action:      { type: "string" },
          resource:    { type: "string", nullable: true },
          resource_id: { type: "string", nullable: true },
          details:     { type: "string", nullable: true },
          ip:          { type: "string", nullable: true },
          created_at:  { type: "string", format: "date-time" },
          user_email:  { type: "string", nullable: true },
          user_name:   { type: "string", nullable: true },
        },
      },
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
      },
    },
  },
  security: [{ cookieAuth: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["Meta"],
        summary: "Service health",
        description: "Public deployment health check that verifies application and database readiness.",
        security: [],
        responses: {
          200: { description: "Application and database are healthy" },
          503: { description: "Application is running but the database is unavailable" },
        },
      },
    },
    // ── Auth ────────────────────────────────────────────────────────────
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in",
        description: "Authenticates a user and sets `bp_token` + `bp_theme` cookies.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email:        { type: "string", format: "email" },
                  password:     { type: "string" },
                  trustDevice:  { type: "boolean", description: "If true, also issues a device token so this device can skip the password step next time (see /auth/device)" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Logged in",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    user: {
                      type: "object",
                      properties: {
                        id:     { type: "integer" },
                        email:  { type: "string", format: "email" },
                        name:   { type: "string", nullable: true },
                        avatar: { type: "integer", nullable: true, description: "Avatar number 1-127, null for default" },
                      },
                    },
                    deviceToken: { type: "string", description: "Opaque trust token, only present when trustDevice was true. Store client-side and redeem via POST /auth/device." },
                  },
                },
              },
            },
          },
          400: { description: "Missing fields", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Invalid credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          403: { description: "Account pending or rejected", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/device": {
      post: {
        tags: ["Auth"],
        summary: "Log in with a trusted device token",
        description: "Exchanges a device token (issued by /auth/login with trustDevice: true) for a session, skipping the password step. Sets `bp_token` + `bp_theme` cookies.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "token"],
                properties: {
                  email: { type: "string", format: "email" },
                  token: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Logged in",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    user: {
                      type: "object",
                      properties: {
                        id:     { type: "integer" },
                        email:  { type: "string", format: "email" },
                        name:   { type: "string", nullable: true },
                        avatar: { type: "integer", nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Missing fields", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          401: { description: "Device token invalid or expired", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          403: { description: "Account not active", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
      delete: {
        tags: ["Auth"],
        summary: "Revoke a trusted device token",
        description: "Used by the login screen's 'forget' action to untrust a device. Public endpoint — the token itself is the credential.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "token"],
                properties: {
                  email: { type: "string", format: "email" },
                  token: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Revoked (idempotent — no error if the token didn't exist)" },
          400: { description: "Missing fields", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out",
        description: "Clears the session cookie.",
        responses: {
          200: { description: "Logged out" },
        },
      },
    },
    "/auth/signup": {
      post: {
        tags: ["Auth"],
        summary: "Register a new account",
        description: "Creates a new user with `pending` status. Requires admin approval before login is allowed.",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email:    { type: "string", format: "email" },
                  password: { type: "string", minLength: 6 },
                  name:     { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Account created, awaiting approval" },
          400: { description: "Validation error or duplicate email", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },

    // ── Me ──────────────────────────────────────────────────────────────
    "/me/theme": {
      patch: {
        tags: ["Me"],
        summary: "Update theme preference",
        description: "Saves dark/light preference to the database and refreshes the `bp_theme` cookie.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["theme"], properties: { theme: { type: "string", enum: ["dark", "light"] } } },
            },
          },
        },
        responses: {
          200: { description: "Theme updated" },
          400: { description: "Invalid theme value" },
          401: { description: "Not authenticated" },
        },
      },
    },
    "/me/profile": {
      get: {
        tags: ["Me"],
        summary: "Get own profile",
        description: "Returns the current user's name, email, and avatar number (1–127; null means no avatar saved — caller should derive a default).",
        responses: {
          200: { description: "Profile data", content: { "application/json": { schema: { type: "object", properties: { name: { type: "string", nullable: true }, email: { type: "string" }, avatar: { type: "integer", nullable: true, minimum: 1, maximum: 127 } } } } } },
          401: { description: "Not authenticated" },
          404: { description: "User not found" },
        },
      },
      patch: {
        tags: ["Me"],
        summary: "Update own profile",
        description: "Update name, email, and/or password for the currently logged-in user. Password change requires `currentPassword`.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name:            { type: "string", nullable: true },
                  email:           { type: "string", format: "email" },
                  currentPassword: { type: "string", description: "Required when changing password" },
                  newPassword:     { type: "string" },
                  avatar:          { type: "integer", minimum: 1, maximum: 127, description: "Avatar number (1–127); values outside this range are ignored" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Profile updated, new JWT cookie set", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, name: { type: "string", nullable: true }, email: { type: "string" } } } } } },
          400: { description: "Validation error or wrong current password" },
          401: { description: "Not authenticated" },
        },
      },
    },

    // ── Dashboard ───────────────────────────────────────────────────────
    "/dashboard": {
      get: {
        tags: ["Dashboard"],
        summary: "Dashboard stats",
        description: "Returns user counts and recent registrations.",
        responses: {
          200: {
            description: "Stats",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    totalUsers:    { type: "integer" },
                    pendingUsers:  { type: "integer" },
                    approvedUsers: { type: "integer" },
                    auditCount:    { type: "integer" },
                    recentUsers:   { type: "array", items: { $ref: "#/components/schemas/User" } },
                  },
                },
              },
            },
          },
          401: { description: "Not authenticated" },
        },
      },
    },

    // ── Users ───────────────────────────────────────────────────────────
    "/users": {
      get: {
        tags: ["Users"],
        summary: "List all users",
        description: "Returns all users ordered by creation date. Admin only.",
        responses: {
          200: { description: "User list", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/User" } } } } },
          401: { description: "Not authenticated" },
          403: { description: "Admin role required" },
        },
      },
    },
    "/users/{id}": {
      patch: {
        tags: ["Users"],
        summary: "Update a user",
        description: "Update status and/or role. Admin only.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", enum: ["pending", "approved", "rejected"] },
                  role:   { type: "string", enum: ["user", "admin"] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Updated" },
          401: { description: "Not authenticated" },
          403: { description: "Admin role required" },
          404: { description: "User not found" },
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Delete a user",
        description: "Permanently removes a user. Admin only.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          200: { description: "Deleted" },
          401: { description: "Not authenticated" },
          403: { description: "Admin role required" },
        },
      },
    },

    // ── Audit ───────────────────────────────────────────────────────────
    "/audit": {
      get: {
        tags: ["Audit"],
        summary: "List audit log entries",
        description: "Paginated audit log with optional action filter. Admin only.",
        parameters: [
          { name: "page",   in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit",  in: "query", schema: { type: "integer", default: 25 } },
          { name: "action", in: "query", schema: { type: "string" }, description: "Filter by action name" },
        ],
        responses: {
          200: {
            description: "Paginated results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    entries: { type: "array", items: { $ref: "#/components/schemas/AuditEntry" } },
                    total:   { type: "integer" },
                    page:    { type: "integer" },
                    pages:   { type: "integer" },
                  },
                },
              },
            },
          },
          401: { description: "Not authenticated" },
          403: { description: "Admin role required" },
        },
      },
    },

    // ── Feature Flags ────────────────────────────────────────────────────
    "/feature-flags": {
      get: {
        tags: ["Feature Flags"],
        summary: "List all feature flags",
        description: "Returns all flags and their enabled state. Available to all authenticated users (for client-side enforcement).",
        responses: {
          200: {
            description: "Map of flag key → flag object",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: {
                    type: "object",
                    properties: {
                      key:         { type: "string" },
                      enabled:     { type: "boolean" },
                      label:       { type: "string" },
                      description: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Not authenticated" },
        },
      },
    },
    "/feature-flags/{key}": {
      patch: {
        tags: ["Feature Flags"],
        summary: "Toggle a feature flag",
        description: "Enable or disable a named feature flag. Admin only.",
        parameters: [{ name: "key", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["enabled"], properties: { enabled: { type: "boolean" } } },
            },
          },
        },
        responses: {
          200: { description: "Flag updated" },
          400: { description: "Invalid payload" },
          401: { description: "Not authenticated" },
          403: { description: "Admin role required" },
          404: { description: "Flag not found" },
        },
      },
    },

    // ── Changelog ───────────────────────────────────────────────────────
    "/changelog": {
      get: {
        tags: ["Changelog"],
        summary: "List changelog entries",
        description: "Returns all development changelog entries ordered by date descending. Entries are sourced from `src/data/changelog.ts` and synced to the DB on startup.",
        responses: {
          200: {
            description: "Array of changelog entries",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id:          { type: "integer" },
                      date:        { type: "string", format: "date" },
                      description: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Not authenticated" },
        },
      },
    },

    // ── Assets ──────────────────────────────────────────────────────────
    "/assets": {
      get: {
        tags: ["Assets"],
        summary: "List local assets",
        description: "Returns assets pulled from the configured Pixxel server, ordered by name.",
        responses: {
          200: {
            description: "Asset list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    assets: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id:                { type: "string" },
                          pixxel_asset_id:   { type: "string" },
                          name:              { type: "string" },
                          short_code:        { type: "string", nullable: true },
                          category:          { type: "string", nullable: true },
                          type:              { type: "string", nullable: true },
                          lifecycle_status:  { type: "string", nullable: true },
                          description:       { type: "string", nullable: true },
                          business_owner:    { type: "string", nullable: true },
                          technical_owner:   { type: "string", nullable: true },
                          vendor:            { type: "string", nullable: true },
                          app_url:           { type: "string", nullable: true },
                          doc_url:           { type: "string", nullable: true },
                          created_at:        { type: "string", format: "date-time" },
                          updated_at:        { type: "string", format: "date-time" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Not authenticated" },
        },
      },
    },

    // ── Business service monitoring ────────────────────────────────────
    "/business-services": {
      get: {
        tags: ["Business Services"],
        summary: "List business services",
        description: "Lists services with asset and configured-monitor counts.",
        responses: { 200: { description: "Business service list" }, 401: { description: "Not authenticated" } },
      },
      post: {
        tags: ["Business Services"],
        summary: "Create a business service",
        description: "Creates a service and assigns assets. Editor or admin role required.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "assetIds"], properties: { name: { type: "string" }, description: { type: "string", nullable: true }, assetIds: { type: "array", items: { type: "string" } } } } } } },
        responses: { 201: { description: "Created" }, 400: { description: "Invalid request" }, 401: { description: "Not authenticated" }, 403: { description: "Editor or admin role required" } },
      },
    },
    "/business-services/{id}": {
      get: {
        tags: ["Business Services"], summary: "Get a business service and its assets",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "Business service" }, 404: { description: "Not found" } },
      },
      patch: {
        tags: ["Business Services"], summary: "Update a business service", description: "Replaces service details and assigned assets. Editor or admin role required.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "assetIds"], properties: { name: { type: "string" }, description: { type: "string", nullable: true }, assetIds: { type: "array", items: { type: "string" } } } } } } },
        responses: { 200: { description: "Updated" }, 403: { description: "Editor or admin role required" }, 404: { description: "Not found" } },
      },
      delete: {
        tags: ["Business Services"], summary: "Delete a business service", description: "Deletes the service only; assets and monitor configurations remain. Editor or admin role required.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { 200: { description: "Deleted" }, 403: { description: "Editor or admin role required" }, 404: { description: "Not found" } },
      },
    },
    "/assets/{id}/monitor": {
      get: {
        tags: ["Monitoring"], summary: "Get an asset monitor configuration", description: "Secret headers and request bodies are never returned.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Asset and safe monitor configuration" }, 404: { description: "Asset not found" } },
      },
      put: {
        tags: ["Monitoring"], summary: "Create or replace an asset monitor", description: "Supports generic HTTP, Statuspage, and custom HTTP requests. Headers and request bodies are encrypted at rest. Editor or admin role required.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["check_type", "url"], properties: { check_type: { type: "string", enum: ["http", "statuspage", "custom"] }, url: { type: "string", format: "uri" }, method: { type: "string", enum: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] }, expected_status: { type: "integer", minimum: 100, maximum: 599 }, timeout_ms: { type: "integer", minimum: 1000, maximum: 30000 }, headers: { type: "string", description: "JSON object encrypted before storage" }, request_body: { type: "string", description: "Request body encrypted before storage" }, statuspage_component_id: { type: "string" } } } } } },
        responses: { 200: { description: "Saved" }, 400: { description: "Invalid configuration" }, 403: { description: "Editor or admin role required" } },
      },
      post: {
        tags: ["Monitoring"], summary: "Test an asset monitor configuration", description: "Runs the supplied configuration without saving it. Blank secret fields reuse any encrypted values already stored for the asset. Editor or admin role required.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["check_type", "url"], properties: { check_type: { type: "string", enum: ["http", "statuspage", "custom"] }, url: { type: "string", format: "uri" }, method: { type: "string", enum: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] }, expected_status: { type: "integer", minimum: 100, maximum: 599 }, timeout_ms: { type: "integer", minimum: 1000, maximum: 30000 }, headers: { type: "string" }, request_body: { type: "string" }, statuspage_component_id: { type: "string" } } } } } },
        responses: { 200: { description: "Test result including status, response code, response time, and message" }, 400: { description: "Invalid configuration or test failed" }, 403: { description: "Editor or admin role required" }, 404: { description: "Asset not found" } },
      },
      delete: {
        tags: ["Monitoring"], summary: "Remove an asset monitor", description: "Editor or admin role required.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Removed" }, 403: { description: "Editor or admin role required" } },
      },
    },
    "/statuspage/discover": {
      post: {
        tags: ["Monitoring"], summary: "Discover Statuspage components", description: "Converts a Statuspage landing-page URL to its components API and returns selectable components.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["url"], properties: { url: { type: "string", format: "uri" } } } } } },
        responses: { 200: { description: "Component list" }, 400: { description: "Discovery failed" } },
      },
    },
    "/verification": {
      post: {
        tags: ["Monitoring"], summary: "Run live business-service verification", description: "Checks every assigned asset in parallel and returns healthy, degraded, or down overall status.",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["serviceId"], properties: { serviceId: { type: "integer" } } } } } },
        responses: { 200: { description: "Verification results" }, 400: { description: "Invalid service" }, 404: { description: "Service not found" } },
      },
    },

    // ── Settings: Pixxel Connection ────────────────────────────────────
    "/settings/pixxel-sync": {
      get: {
        tags: ["Settings"],
        summary: "Get Pixxel connection config",
        description: "Returns the configured Pixxel server URL, masked API key, and last pull status.",
        responses: {
          200: { description: "Connection config" },
          401: { description: "Not authenticated" },
        },
      },
      post: {
        tags: ["Settings"],
        summary: "Manage the Pixxel connection",
        description: "Admin only. `action` selects the operation: `update_config` saves the server URL/API key, `test_connection` verifies reachability without writing local data, `pull_now` fetches `/api/assets` from the configured Pixxel server and upserts them into the local asset registry.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["action"],
                properties: {
                  action:     { type: "string", enum: ["update_config", "test_connection", "pull_now"] },
                  server_url: { type: "string", description: "Base URL of the Pixxel server" },
                  api_key:    { type: "string", description: "Bearer API key issued by the Pixxel server" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Action result" },
          400: { description: "Invalid action or missing API key" },
          401: { description: "Not authenticated" },
          403: { description: "Admin role required" },
          502: { description: "Could not reach the Pixxel server" },
        },
      },
    },

    // ── OpenAPI ─────────────────────────────────────────────────────────
    "/openapi": {
      get: {
        tags: ["Meta"],
        summary: "OpenAPI specification",
        description: "Returns this OpenAPI 3.0 spec as JSON.",
        security: [],
        responses: {
          200: { description: "OpenAPI spec" },
        },
      },
    },
  },
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(spec);
}
