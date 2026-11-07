import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  effects: [] as (() => unknown)[],
  eq: vi.fn(),
  from: vi.fn(),
}));
vi.mock("react", () => ({
  useEffect: (callback: () => unknown) => mocks.effects.push(callback),
  useMemo: (callback: () => unknown) => callback(),
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock("@/hooks/useDealSignals", () => ({
  useDealSignals: () => new Map(),
  emptyDealSignal: {},
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));

import { useOperationsHome } from "./useOperationsHome";

beforeEach(() => {
  mocks.effects.length = 0;
  vi.clearAllMocks();
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      is: () => query,
      not: async () => ({ data: [] }),
      eq: (column: string, value: unknown) => {
        mocks.eq(table, column, value);
        return Promise.resolve({ count: 3 });
      },
    };
    return query;
  });
});

it("counts unreviewed applications by their pending status", async () => {
  useOperationsHome({ email: "rep@example.com" });
  mocks.effects[1]?.();
  await vi.waitFor(() => {
    expect(mocks.eq).toHaveBeenCalledWith("applications", "status", "pending");
  });
});