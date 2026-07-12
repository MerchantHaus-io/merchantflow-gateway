import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_TYPE_ROUTES,
  resolveNotificationRoute,
} from "./notification-routes";

describe("resolveNotificationRoute", () => {
  describe("explicit link precedence", () => {
    it("prefers a stored link that begins with '/'", () => {
      expect(
        resolveNotificationRoute({
          type: "task",
          link: "/opportunities/abc-123",
        }),
      ).toBe("/opportunities/abc-123");
    });

    it("ignores non-absolute links and falls back to type mapping", () => {
      expect(
        resolveNotificationRoute({ type: "task", link: "opportunities" }),
      ).toBe("/my-tasks");
    });

    it("ignores empty/null link and falls back to type mapping", () => {
      expect(resolveNotificationRoute({ type: "calendar", link: null })).toBe(
        "/calendar",
      );
      expect(resolveNotificationRoute({ type: "calendar", link: "" })).toBe(
        "/calendar",
      );
    });
  });

  describe("category fallback (before type)", () => {
    it("routes stage_change category to /opportunities", () => {
      expect(
        resolveNotificationRoute({
          type: "success",
          notification_category: "stage_change",
        }),
      ).toBe("/opportunities");
    });

    it("routes task_assignment category to /my-tasks", () => {
      expect(
        resolveNotificationRoute({
          type: "info",
          notification_category: "task_assignment",
        }),
      ).toBe("/my-tasks");
    });
  });

  describe("deterministic type -> route map", () => {
    const cases: Array<[string, string]> = [
      ["task", "/my-tasks"],
      ["task_assignment", "/my-tasks"],
      ["stage_change", "/opportunities"],
      ["calendar", "/calendar"],
      ["meeting", "/calendar"],
      ["milestone", "/opportunities"],
      ["portal_lead", "/admin/web-submissions"],
      ["application", "/opportunities"],
      ["call", "/notifications"],
      ["sms", "/notifications"],
      ["message", "/notifications"],
      ["nmi_webhook", "/reports/transactions"],
      ["transaction", "/reports/transactions"],
      ["commission", "/commissions"],
      ["inactivity_reminder", "/settings"],
      ["deletion_request", "/admin/deletion-requests"],
      ["support", "/support"],
      ["general", "/notifications"],
    ];

    it.each(cases)("maps type '%s' to '%s'", (type, expected) => {
      expect(resolveNotificationRoute({ type })).toBe(expected);
      expect(NOTIFICATION_TYPE_ROUTES[type]).toBe(expected);
    });
  });

  describe("unknown / missing inputs", () => {
    it("returns null for unknown type with no link/category", () => {
      expect(resolveNotificationRoute({ type: "does_not_exist" })).toBeNull();
    });

    it("returns null for a fully empty notification", () => {
      expect(resolveNotificationRoute({})).toBeNull();
    });

    it("returns null when only an unknown category is present", () => {
      expect(
        resolveNotificationRoute({ notification_category: "mystery" }),
      ).toBeNull();
    });
  });

  describe("precedence ordering", () => {
    it("link > category > type", () => {
      expect(
        resolveNotificationRoute({
          link: "/custom/path",
          notification_category: "stage_change",
          type: "task",
        }),
      ).toBe("/custom/path");
    });

    it("category > type when link absent", () => {
      expect(
        resolveNotificationRoute({
          notification_category: "task_assignment",
          type: "calendar",
        }),
      ).toBe("/my-tasks");
    });
  });
});
