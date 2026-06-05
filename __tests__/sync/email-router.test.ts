import { describe, it, expect, beforeEach } from "vitest";
import { vol } from "memfs";
import {
  extractEmailAddress,
  domainOf,
  parseAddressList,
  buildRoutingTable,
  routeMessage,
} from "../../src/sync/email-router.js";

beforeEach(() => {
  vol.reset();
});

describe("extractEmailAddress", () => {
  it("pulls the address out of a display-name header", () => {
    expect(extractEmailAddress("Jane Doe <Jane@Acme.COM>")).toBe("jane@acme.com");
  });
  it("returns a bare address unchanged (lowercased)", () => {
    expect(extractEmailAddress("BOB@x.io")).toBe("bob@x.io");
  });
});

describe("domainOf", () => {
  it("returns the domain", () => {
    expect(domainOf("a@b.com")).toBe("b.com");
  });
  it("returns empty for malformed input", () => {
    expect(domainOf("not-an-email")).toBe("");
  });
});

describe("parseAddressList", () => {
  it("splits multiple recipients", () => {
    expect(parseAddressList("A <a@x.com>, b@y.com")).toEqual(["a@x.com", "b@y.com"]);
  });
  it("returns empty for undefined", () => {
    expect(parseAddressList(undefined)).toEqual([]);
  });
});

describe("buildRoutingTable", () => {
  it("indexes customers by domain and email", () => {
    vol.fromJSON({
      "/data/customers/acme/main_facts.md":
        "---\nname: Acme\ndomain: acme.com\nprimary_contact: ceo@acme.com\n---\n",
      "/data/customers/globex/main_facts.md": "---\nname: Globex\nemail: hello@globex.io\n---\n",
      "/data/customers/empty/main_facts.md": "---\nname: NoIds\n---\n",
    });
    const table = buildRoutingTable("/data");
    const acme = table.find((c) => c.slug === "acme")!;
    expect(acme.domains).toContain("acme.com");
    expect(acme.emails).toContain("ceo@acme.com");
    const globex = table.find((c) => c.slug === "globex")!;
    expect(globex.domains).toContain("globex.io");
    expect(globex.emails).toContain("hello@globex.io");
    const empty = table.find((c) => c.slug === "empty")!;
    expect(empty.domains).toEqual([]);
    expect(empty.emails).toEqual([]);
  });
});

describe("routeMessage", () => {
  const table = [
    { slug: "acme", domains: ["acme.com"], emails: ["ceo@acme.com"] },
    { slug: "globex", domains: ["globex.io"], emails: [] },
  ];

  it("routes by domain match", () => {
    expect(routeMessage(["sales@acme.com"], table)).toBe("acme");
    expect(routeMessage(["someone@globex.io"], table)).toBe("globex");
  });

  it("prefers exact email match over domain match", () => {
    const t = [
      { slug: "generic", domains: ["acme.com"], emails: [] },
      { slug: "ceo-vip", domains: [], emails: ["ceo@acme.com"] },
    ];
    expect(routeMessage(["ceo@acme.com"], t)).toBe("ceo-vip");
  });

  it("returns null when nothing matches (unrouted)", () => {
    expect(routeMessage(["stranger@nowhere.net"], table)).toBeNull();
  });

  it("returns null for empty/invalid address sets", () => {
    expect(routeMessage([], table)).toBeNull();
    expect(routeMessage(["garbage"], table)).toBeNull();
  });

  it("matches any of from/to/cc", () => {
    // outbound: from us, to the customer
    expect(routeMessage(["me@myco.com", "buyer@acme.com"], table)).toBe("acme");
  });
});
