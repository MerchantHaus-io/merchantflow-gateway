import { describe, it, expect } from "vitest";
import { resolveAdminRole, SIGNED_OUT_ADMIN_ROLE } from "./adminRole";

describe("resolveAdminRole", () => {
  it("grants admin when the lookup returns a row", () => {
    expect(resolveAdminRole({ data: { role: "admin" }, error: null })).toEqual({
      isAdmin: true,
      roleUnavailable: false,
    });
  });

  it("denies admin when the lookup succeeds with no row", () => {
    expect(resolveAdminRole({ data: null, error: null })).toEqual({
      isAdmin: false,
      roleUnavailable: false,
    });
  });

  // The regression this file exists for. The previous implementation fell back
  // to a hardcoded admin email list whenever the query errored, so a network
  // blip granted admin to whoever was on that list.
  it("denies admin when the lookup errors, and reports the role as unavailable", () => {
    expect(
      resolveAdminRole({ data: null, error: new Error("network") }),
    ).toEqual({ isAdmin: false, roleUnavailable: true });
  });

  it("denies admin when the lookup errors even if a row came back with it", () => {
    expect(
      resolveAdminRole({ data: { role: "admin" }, error: new Error("network") }),
    ).toEqual({ isAdmin: false, roleUnavailable: true });
  });

  it("distinguishes a failed lookup from a confirmed non-admin", () => {
    const failed = resolveAdminRole({ data: null, error: new Error("boom") });
    const confirmed = resolveAdminRole({ data: null, error: null });

    expect(failed.isAdmin).toBe(confirmed.isAdmin);
    expect(failed.roleUnavailable).not.toBe(confirmed.roleUnavailable);
  });

  it("treats a signed-out user as a known non-admin, not an unknown one", () => {
    expect(SIGNED_OUT_ADMIN_ROLE).toEqual({
      isAdmin: false,
      roleUnavailable: false,
    });
  });
});
