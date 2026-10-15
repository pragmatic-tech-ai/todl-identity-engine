import { test } from "node:test";
import assert from "node:assert/strict";
import { Principal, PrincipalKind, PrivilegeAction } from "@pragmatic-tech-ai/todl-identity";
import type { IFieldSecurityConfig, IMembershipConfig } from "@pragmatic-tech-ai/todl-identity";
import { TenantSecurityModel } from "../tenant-security-model.js";
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

    public static Principal(id: string, claims: Array<[string, string]> = [], groups: string[] = []): Principal
    {
        return new Principal(id, "t1", PrincipalKind.User, new Map(claims), groups);
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

class Cfg
{
    public static Make(securedFields: IFieldSecurityConfig["securedFields"], profiles: IFieldSecurityConfig["profiles"], assignment: Partial<IFieldSecurityConfig["profileAssignment"]> = {}): IFieldSecurityConfig
    {
        return { securedFields, profiles, profileAssignment: { claimsMapping: [], overrides: [], teamProfiles: [], ...assignment } };
    }
}

test("empty concept in securedFields is malformed", () =>
{
    assert.throws(() => FieldSecurityEvaluator.FromConfig(Cfg.Make([{ concept: "", field: "cost" }], []), Fx.Membership()), MalformedFieldSecurityError);
});

test("empty field name in securedFields is malformed", () =>
{
    assert.throws(() => FieldSecurityEvaluator.FromConfig(Cfg.Make([{ concept: Widget, field: "" }], []), Fx.Membership()), MalformedFieldSecurityError);
});

test("duplicate secured field is malformed", () =>
{
    const dup = [{ concept: Widget, field: "cost" }, { concept: Widget, field: "cost" }];
    assert.throws(() => FieldSecurityEvaluator.FromConfig(Cfg.Make(dup, []), Fx.Membership()), MalformedFieldSecurityError);
});

test("duplicate profile id is malformed", () =>
{
    const profiles = [{ id: "p", name: "A", grants: [] }, { id: "p", name: "B", grants: [] }];
    assert.throws(() => FieldSecurityEvaluator.FromConfig(Cfg.Make([], profiles), Fx.Membership()), MalformedFieldSecurityError);
});

test("unknown profile via overrides channel is malformed", () =>
{
    const bad = Cfg.Make([], [], { overrides: [{ principalId: "u", profiles: ["ghost"] }] });
    assert.throws(() => FieldSecurityEvaluator.FromConfig(bad, Fx.Membership()), MalformedFieldSecurityError);
});

test("unknown profile via teamProfiles channel is malformed", () =>
{
    const bad = Cfg.Make([], [], { teamProfiles: [{ teamId: "t", profiles: ["ghost"] }] });
    assert.throws(() => FieldSecurityEvaluator.FromConfig(bad, Fx.Membership()), MalformedFieldSecurityError);
});

test("group claims rule grants read to a member and denies a non-member", () =>
{
    const config = Cfg.Make(
        [{ concept: Widget, field: "cost" }],
        [{ id: "reader", name: "R", grants: [{ concept: Widget, field: "cost", read: true }] }],
        { claimsMapping: [{ claim: "group", value: "finance", profiles: ["reader"] }] });
    const e = FieldSecurityEvaluator.FromConfig(config, Fx.Membership());
    assert.equal(e.CanReadField(Fx.Principal("g1", [], ["finance"]), Widget, "cost"), true);
    assert.equal(e.CanReadField(Fx.Principal("g2", [], ["other"]), Widget, "cost"), false);
});

test("create grant allows Create; read-only grant denies Create", () =>
{
    const config = Cfg.Make(
        [{ concept: Widget, field: "cost" }],
        [
            { id: "creator", name: "C", grants: [{ concept: Widget, field: "cost", create: true }] },
            { id: "reader", name: "R", grants: [{ concept: Widget, field: "cost", read: true }] },
        ],
        { overrides: [{ principalId: "c", profiles: ["creator"] }, { principalId: "r", profiles: ["reader"] }] });
    const e = FieldSecurityEvaluator.FromConfig(config, Fx.Membership());
    assert.equal(e.CanWriteField(Fx.Principal("c"), Widget, "cost", PrivilegeAction.Create), true);
    assert.equal(e.CanWriteField(Fx.Principal("r"), Widget, "cost", PrivilegeAction.Create), false);
});

test("grant for a different field on the same concept does not unlock the secured field", () =>
{
    const config = Cfg.Make(
        [{ concept: Widget, field: "cost" }],
        [{ id: "other", name: "O", grants: [{ concept: Widget, field: "label", read: true, update: true }] }],
        { overrides: [{ principalId: "o", profiles: ["other"] }] });
    const e = FieldSecurityEvaluator.FromConfig(config, Fx.Membership());
    assert.equal(e.CanReadField(Fx.Principal("o"), Widget, "cost"), false);
});

test("team profile rule is skipped when the principal is not in the team", () =>
{
    // u3 has no membership override, so it is in no team.
    const e = FieldSecurityEvaluator.FromConfig(Fx.Config(), Fx.Membership());
    assert.equal(e.CanReadField(Fx.Principal("u3"), Widget, "cost"), false);
});

test("TenantSecurityModel exposes field security from config and Open when absent", () =>
{
    const baseModel = {
        businessUnits: [{ id: "root", name: "Root" }],
        teams: [],
        membership: { claimsMapping: [], overrides: [] },
        ownershipRules: [],
    };
    const withField = TenantSecurityModel.FromConfig({ ...baseModel, fieldSecurity: Fx.Config() });
    assert.equal(withField.FieldSecurity().IsSecured(Widget, "cost"), true);
    const without = TenantSecurityModel.FromConfig(baseModel);
    assert.equal(without.FieldSecurity().IsSecured(Widget, "cost"), false);
});
