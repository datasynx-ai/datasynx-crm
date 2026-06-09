import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  customerOwnerMap,
  lastAuditActorMap,
  resolveDealOwner,
  UNASSIGNED_OWNER,
} from "../../src/core/forecast-owner.js";

const DATA_DIR = "/data";

beforeEach(() => vol.reset());

describe("forecast owner resolution (#51)", () => {
  it("inverts rbac owned_customers into slug → owner", () => {
    vol.fromJSON({
      "/data/.agentic/rbac.json": JSON.stringify({
        actors: { alice: "rep", bob: "rep" },
        owned_customers: { alice: ["acme-corp", "gamma"], bob: ["beta"] },
      }),
    });
    const map = customerOwnerMap(DATA_DIR);
    expect(map.get("acme-corp")).toBe("alice");
    expect(map.get("gamma")).toBe("alice");
    expect(map.get("beta")).toBe("bob");
  });

  it("reads the most recent non-system actor per slug from the audit log", () => {
    vol.fromJSON({
      "/data/.agentic/audit.log": [
        "2026-06-01T00:00:00Z | system | create | acme | seed",
        "2026-06-02T00:00:00Z | alice | update_deal | acme | first",
        "2026-06-03T00:00:00Z | bob | update_deal | acme | latest",
      ].join("\n"),
    });
    const map = lastAuditActorMap(DATA_DIR);
    expect(map.get("acme")).toBe("bob");
  });

  it("resolves owner by precedence: explicit → rbac → audit → unassigned", () => {
    const rbac = new Map([["acme", "alice"]]);
    const audit = new Map([["beta", "bob"]]);
    expect(resolveDealOwner("dave", "acme", rbac, audit)).toBe("dave"); // explicit wins
    expect(resolveDealOwner(undefined, "acme", rbac, audit)).toBe("alice"); // rbac
    expect(resolveDealOwner("  ", "beta", rbac, audit)).toBe("bob"); // blank → audit
    expect(resolveDealOwner(undefined, "ghost", rbac, audit)).toBe(UNASSIGNED_OWNER);
  });
});
