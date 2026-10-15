import { test } from "node:test";
import assert from "node:assert/strict";
import { Principal, PrincipalKind, PrivilegeAction } from "@pragmatic-tech-ai/todl-identity";
import type { IFieldSecurityConfig, IMembershipConfig } from "@pragmatic-tech-ai/todl-identity";
import { BusinessUnitHierarchy } from "../business-unit-hierarchy.js";
import { MembershipResolver } from "../membership-resolver.js";
import { FieldSecurityEvaluator, MalformedFieldSecurityError } from "../field-security-evaluator.js";

const Widget = "shop.Widget";

class Fx
{
    public static Membership(): MembershipResolver
    {
        const hierarchy = BusinessUnitHierarchy.FromConfig([{ id: "root", name: "Root" }, { id: "sales", name: "Sales", parent: "root" }]);
        const config: IMembershipConfig = { claimsMapping: [], overrides: [{ principalId: "u1", homeBusinessUnit: "sales", teams: ["t-cost"] }] };
        return new MembershipResolver(config, hierarchy);
    }

    public static Config(): IFieldSecurityConfig
    {
        return {
            securedFields: [{ concept: Widget, field: "cost" }],
            profiles: [
                { id: "reader", name: "Cost Reader", grants: [{ concept: Widget, field: "cost", read: true }] },
                { id: "editor", name: "Cost Editor", grants: [{ concept: Widget, field: "cost", read: true, update: true }] },
            ],
            profileAssignment: {
                claimsMapping: [{ claim: "r", value: "cost", profiles: ["reader"] }],
                overrides: [{ principalId: "u2", profiles: ["editor"] }],
                teamProfiles: [{ teamId: "t-cost", profiles: ["reader"] }],
            },
        };
    }

    public static Principal(id: string, claims: Array<[string, string]> = []): Principal
    {
        return new Principal(id, "t1", PrincipalKind.User, new Map(claims), []);
    }
}

test("open (no config) allows every field read and write", () =>
{
    const e = FieldSecurityEvaluator.Open();
    assert.equal(e.IsSecured(Widget, "cost"), false);
    assert.equal(e.CanReadField(Fx.Principal("x"), Widget, "cost"), true);
    assert.equal(e.CanWriteField(Fx.Principal("x"), Widget, "cost", PrivilegeAction.Update), true);
});

test("unsecured field is always allowed", () =>
{
    const e = FieldSecurityEvaluator.FromConfig(Fx.Config(), Fx.Membership());
    assert.equal(e.CanReadField(Fx.Principal("nobody"), Widget, "label"), true);
});

test("secured field denied without a granting assigned profile (default-deny)", () =>
{
    const e = FieldSecurityEvaluator.FromConfig(Fx.Config(), Fx.Membership());
    assert.equal(e.CanReadField(Fx.Principal("nobody"), Widget, "cost"), false);
});

test("grant via claims rule unlocks read but not update", () =>
{
    const e = FieldSecurityEvaluator.FromConfig(Fx.Config(), Fx.Membership());
    const p = Fx.Principal("c1", [["r", "cost"]]);
    assert.equal(e.CanReadField(p, Widget, "cost"), true);
    assert.equal(e.CanWriteField(p, Widget, "cost", PrivilegeAction.Update), false);
});

test("grant via principal override unlocks update", () =>
{
    const e = FieldSecurityEvaluator.FromConfig(Fx.Config(), Fx.Membership());
    assert.equal(e.CanWriteField(Fx.Principal("u2"), Widget, "cost", PrivilegeAction.Update), true);
});

test("grant via team profile unlocks read", () =>
{
    const e = FieldSecurityEvaluator.FromConfig(Fx.Config(), Fx.Membership());
    // u1's membership override puts it in team t-cost → teamProfiles grants 'reader'.
    assert.equal(e.CanReadField(Fx.Principal("u1"), Widget, "cost"), true);
});

test("assignment referencing an unknown profile is malformed", () =>
{
    const bad: IFieldSecurityConfig = {
        securedFields: [{ concept: Widget, field: "cost" }],
        profiles: [],
        profileAssignment: { claimsMapping: [{ claim: "r", value: "cost", profiles: ["ghost"] }], overrides: [], teamProfiles: [] },
    };
    assert.throws(() => FieldSecurityEvaluator.FromConfig(bad, Fx.Membership()), MalformedFieldSecurityError);
});
