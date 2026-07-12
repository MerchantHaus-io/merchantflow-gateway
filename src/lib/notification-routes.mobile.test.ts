import { describe, it, expect } from "vitest";
import {
  MOBILE_NOTIFICATION_TYPE_ROUTES,
  NOTIFICATION_TYPE_ROUTES,
  resolveNotificationRoute,
} from "./notification-routes";

describe("resolveNotificationRoute — mobile overrides", () => {
  describe("mobile-specific type overrides", () => {
    const mobileCases: Array<[string, string]> = [
      ["task", "/tasks"],
      ["task_assignment", "/tasks"],
      ["stage_change", "/pipeline"],
      ["milestone", "/pipeline"],
    ];

    it.each(mobileCases)(
      "maps type '%s' to mobile route '%s'",
      (type, expected) => {
        expect(resolveNotificationRoute({ type }, { mobile: true })).toBe(
          expected,
        );
        expect(MOBILE_NOTIFICATION_TYPE_ROUTES[type]).toBe(expected);
      },
    );

    it("does not affect desktop resolution for the same types", () => {
      expect(resolveNotificationRoute({ type: "task" })).toBe("/my-tasks");
      expect(resolveNotificationRoute({ type: "stage_change" })).toBe(
        "/opportunities",
      );
      expect(resolveNotificationRoute({ type: "milestone" })).toBe(
        "/opportunities",
      );
    });
  });

  describe("mobile falls through to shared map for non-overridden types", () => {
    const sharedCases: Array<[string, string]> = [
      ["calendar", "/calendar"],
      ["meeting", "/calendar"],
      ["portal_lead", "/admin/web-submissions"],
      ["application", "/opportunities"],
      ["nmi_webhook", "/reports/transactions"],
      ["transaction", "/reports/transactions"],
      ["commission", "/commissions"],
      ["inactivity_reminder", "/settings"],
      ["deletion_request", "/admin/deletion-requests"],
      ["support", "/support"],
      ["general", "/notifications"],
      ["call", "/notifications"],
      ["sms", "/notifications"],
      ["message", "/notifications"],
    ];

    it.each(sharedCases)(
      "mobile+'%s' resolves to shared route '%s'",
      (type, expected) => {
        expect(resolveNotificationRoute({ type }, { mobile: true })).toBe(
          expected,
        );
        // sanity: shared map still owns the desktop route
        expect(NOTIFICATION_TYPE_ROUTES[type]).toBe(expected);
      },
    );
  });

  describe("mobile category overrides", () => {
    it("routes stage_change category to /pipeline on mobile", () => {
      expect(
        resolveNotificationRoute(
          { type: "success", notification_category: "stage_change" },
          { mobile: true },
        ),
      ).toBe("/pipeline");
    });

    it("routes task_assignment category to /tasks on mobile", () => {
      expect(
        resolveNotificationRoute(
          { type: "info", notification_category: "task_assignment" },
          { mobile: true },
        ),
      ).toBe("/tasks");
    });
  });

  describe("precedence still holds on mobile", () => {
    it("explicit link wins over any mobile override", () => {
      expect(
        resolveNotificationRoute(
          {
            link: "/opportunities/xyz",
            type: "task",
            notification_category: "task_assignment",
          },
          { mobile: true },
        ),
      ).toBe("/opportunities/xyz");
    });

    it("category outranks type on mobile", () => {
      expect(
        resolveNotificationRoute(
          { type: "calendar", notification_category: "task_assignment" },
          { mobile: true },
        ),
      ).toBe("/tasks");
    });

    it("returns null for unknown mobile type", () => {
      expect(
        resolveNotificationRoute({ type: "does_not_exist" }, { mobile: true }),
      ).toBeNull();
    });
  });

  describe("default option is desktop", () => {
    it("omitting opts equals opts={mobile:false}", () => {
      expect(resolveNotificationRoute({ type: "task" })).toBe(
        resolveNotificationRoute({ type: "task" }, { mobile: false }),
      );
    });
  });
});
