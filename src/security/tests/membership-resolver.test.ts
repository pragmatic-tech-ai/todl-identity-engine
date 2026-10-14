import { test } from "node:test";
import assert from "node:assert/strict";
import { Principal, PrincipalKind } from "@pragmatic-tech-ai/todl-identity";
import type { IMembershipConfig } from "@pragmatic-tech-ai/todl-identity";
import { BusinessUnitHierarchy } from "../business-unit-hierarchy.js";
import { MembershipResolver } from "../membership-resolver.js";

class Fixture
{
    public static Hierarchy(): BusinessUnitHierarchy
    {
        return BusinessUnitHierarchy.FromConfig([
            { id: "root", name: "Root" },
            { id: "eng", name: "Engineering", parent: "root" },
            { id: "sales", name: "Sales", parent: "root" },
        ]);
    }

    public static Principal(claims: Array<[string, string]>, groups: string[], id = "u1"): Principal
    {
        return new Principal(id, "t1", PrincipalKind.User, new Map(claims), groups);
    }
}

test("claims map to home BU and teams", () =>
{
    const config: IMembershipConfig =
    {
        claimsMapping: [{ claim: "dept", value: "eng", homeBusinessUnit: "eng", teams: ["t-web"] }],
        overrides: [],
    };
    const m = new MembershipResolver(config, Fixture.Hierarchy()).Resolve(Fixture.Principal([["dept", "eng"]], []));
    assert.equal(m.homeBusinessUnit, "eng");
    assert.deepEqual(m.teams, ["t-web"]);
});

test("teams union across multiple matching rules", () =>
{
    const config: IMembershipConfig =
    {
        claimsMapping: [
            { claim: "dept", value: "eng", teams: ["t-web"] },
            { claim: "group", value: "oncall", teams: ["t-ops"] },
        ],
        overrides: [],
    };
    const m = new MembershipResolver(config, Fixture.Hierarchy()).Resolve(Fixture.Principal([["dept", "eng"]], ["oncall"]));
    assert.deepEqual(m.teams, ["t-web", "t-ops"]);
});

test("no match homes the principal at the root", () =>
{
    const m = new MembershipResolver({ claimsMapping: [], overrides: [] }, Fixture.Hierarchy()).Resolve(Fixture.Principal([], []));
    assert.equal(m.homeBusinessUnit, "root");
    assert.deepEqual(m.teams, []);
});

test("override replaces home BU", () =>
{
    const config: IMembershipConfig =
    {
        claimsMapping: [{ claim: "dept", value: "eng", homeBusinessUnit: "eng" }],
        overrides: [{ principalId: "u1", homeBusinessUnit: "sales" }],
    };
    assert.equal(new MembershipResolver(config, Fixture.Hierarchy()).Resolve(Fixture.Principal([["dept", "eng"]], [])).homeBusinessUnit, "sales");
});

test("override teams:[] clears claims-derived teams; absent preserves", () =>
{
    const cleared: IMembershipConfig =
    {
        claimsMapping: [{ claim: "dept", value: "eng", teams: ["t-web"] }],
        overrides: [{ principalId: "u1", teams: [] }],
    };
    assert.deepEqual(new MembershipResolver(cleared, Fixture.Hierarchy()).Resolve(Fixture.Principal([["dept", "eng"]], [])).teams, []);

    const preserve: IMembershipConfig =
    {
        claimsMapping: [{ claim: "dept", value: "eng", teams: ["t-web"] }],
        overrides: [{ principalId: "u1", homeBusinessUnit: "sales" }],
    };
    assert.deepEqual(new MembershipResolver(preserve, Fixture.Hierarchy()).Resolve(Fixture.Principal([["dept", "eng"]], [])).teams, ["t-web"]);
});

test("group-channel rule matches via HasGroup, not a literal claim", () =>
{
    const config: IMembershipConfig =
    {
        claimsMapping: [{ claim: "group", value: "admins", homeBusinessUnit: "eng" }],
        overrides: [],
    };
    const resolver = new MembershipResolver(config, Fixture.Hierarchy());
    assert.equal(resolver.Resolve(Fixture.Principal([], ["admins"])).homeBusinessUnit, "eng");
    assert.equal(resolver.Resolve(Fixture.Principal([["group", "admins"]], [])).homeBusinessUnit, "root");
});
