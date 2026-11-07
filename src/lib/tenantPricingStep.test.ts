import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Execute the real worker body with only its network dependencies replaced.
// This catches missing helpers that frontend typechecks cannot see.
const source = readFileSync("supabase/functions/provision-tenant/index.ts", "utf8")
  .replace(/^import .*;\r?\n/gm, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

describe("tenant pricing step", () => {
  it.each(["plan", "gateway_fee", "extra", "one_time", "platform", undefined])(
    "saves %s pricing without an undefined helper or invalid category",
    async (category) => {
      const rows: Record<string, unknown>[] = [];
      let settings: Record<string, unknown> = {};
      const db = {
        from(table: string) {
          const query = {
            select: () => query,
            eq: () => query,
            single: async () => ({ data: { settings: {}, branding: {} } }),
            maybeSingle: async () => ({ data: null }),
            insert: async (row: Record<string, unknown>) => {
              if (table === "tenant_pricing_items") rows.push(row);
              return { error: null };
            },
            update: (row: Record<string, unknown>) => {
              settings = row.settings as Record<string, unknown>;
              return { eq: async () => ({ error: null }) };
            },
          };
          return query;
        },
      };
      const apply = runInNewContext(`${compiled}\napplyOnboardingStep`, { serve: () => {} });
      const result = await apply(
        { db, actorId: "admin", actorEmail: "admin@example.com" },
        "tenant-a", "pricing",
        { items: [{ code: "gateway", label: "Gateway", category, cost: 0, resale: 0 }] },
      );
      expect(result.items).toBe(1);
      expect(rows[0].category).toBe(category == null || category === "platform" ? "gateway_fee" : category);
      expect(rows[0].tenant_id).toBe("tenant-a");
      expect(settings.pricing_confirmed_at).toEqual(expect.any(String));
    },
  );
});