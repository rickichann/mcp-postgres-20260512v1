import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import pg from "pg";
import { z } from "zod";

const connectionString = process.env.DATABASE_URL;

const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const server = new McpServer({
  name: "postgres-readwrite",
  version: "1.0.0"
});

// Read-only query tool
server.tool(
  "query",
  "Run a read-only SQL query (SELECT)",
  { sql: z.string().describe("The SQL SELECT query to execute") },
  async ({ sql }) => {
    try {
      const result = await pool.query(sql);
      return {
        content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Write/execute tool for DDL and DML
server.tool(
  "execute",
  "Execute a SQL statement that modifies data (CREATE, INSERT, UPDATE, DELETE, ALTER, DROP)",
  { sql: z.string().describe("The SQL statement to execute") },
  async ({ sql }) => {
    try {
      const result = await pool.query(sql);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            command: result.command,
            rowCount: result.rowCount,
            rows: result.rows || []
          }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// List tables tool
server.tool(
  "list_tables",
  "List all tables in the database",
  {},
  async () => {
    try {
      const result = await pool.query(`
        SELECT table_schema, table_name 
        FROM information_schema.tables 
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name
      `);
      return {
        content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Describe table tool
server.tool(
  "describe_table",
  "Get the schema/columns of a specific table",
  { table: z.string().describe("Table name (optionally schema-qualified like public.users)") },
  async ({ table }) => {
    try {
      const parts = table.split(".");
      const schema = parts.length > 1 ? parts[0] : "public";
      const tableName = parts.length > 1 ? parts[1] : parts[0];

      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [schema, tableName]);
      return {
        content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
