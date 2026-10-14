import { test } from "node:test";
import assert from "node:assert/strict";
import { Principal, PrincipalKind, PrivilegeAction, AccessLevel, OwnershipSourceKind } from "@pragmatic-tech-ai/todl-identity";
import type { ISecurityModelConfig } from "@pragmatic-tech-ai/todl-identity";
import type { IInstanceView } from "@pragmatic-tech-ai/todl";
import { AccessDepthEvaluator, MalformedRolesError } from "../access-depth-evaluator.js";
import { MalformedBusinessUnitTreeError } from "../business-unit-hierarchy.js";

const Order = "shop.Order";

class Fixture
{
    // BU tree: root -> { eng -> web, sales, field -> field-west }
    public static Config(patch: Partial<ISecurityModelConfig> = {}): ISecurityModelConfig
    {
        const base: ISecurityModelConfig =
        {
            businessUnits: [
                { id: "root", name: "Root" },
                { id: "eng", name: "Eng", parent: "root" },
                { id: "web", name: "Web", parent: "eng" },
                { id: "sales", name: "Sales", parent: "root" },
                { id: "field", name: "Field", parent: "root" },
                { id: "field-west", name: "Field West", parent: "field" },
            ],
            teams: [{ id: "t-field", name: "Field Team", owningBusinessUnit: "field" }],
            membership: { claimsMapping: [{ claim: "dept", value: "eng", homeBusinessUnit: "eng", teams: ["t-field"] }], overrides: [] },
            ownershipRules: [{ concept: Order, owningBusinessUnit: { kind: OwnershipSourceKind.FromField, value: "bu" }, owner: { kind: OwnershipSourceKind.FromField, value: "owner" } }],
            roles: [
                { id: "user-reader", name: "User Reader", privileges: [{ action: PrivilegeAction.Read, concept: Order, level: AccessLevel.User }] },
                { id: "bu-reader", name: "BU Reader", privileges: [{ action: PrivilegeAction.Read, concept: Order, level: AccessLevel.BusinessUnit }] },
                { id: "children-reader", name: "Children Reader", privileges: [{ action: PrivilegeAction.Read, concept: Order, level: AccessLevel.BusinessUnitAndChildren }] },
                { id: "org-reader", name: "Org Reader", privileges: [{ action: PrivilegeAction.Read, concept: Order, level: AccessLevel.Organization }] },
            ],
            roleAssignment:
            {
                claimsMapping: [
                    { claim: "r", value: "user", roles: ["user-reader"] },
                    { claim: "r2", value: "bu", roles: ["bu-reader"] },
                    { claim: "r", value: "children", roles: ["children-reader"] },
                    { claim: "r", value: "org", roles: ["org-reader"] },
                ],
                overrides: [],
                teamRoles: [{ teamId: "t-field", roles: ["bu-reader"] }],
            },
        };
        return { ...base, ...patch };
    }

    public static Principal(claims: Array<[string, string]>, id = "u1"): Principal
    {
        return new Principal(id, "t1", PrincipalKind.User, new Map(claims), []);
    }

    public static View(fields: Record<string, string>): IInstanceView
    {
        return { Concept: Order, Field: (n: string) => (n in fields ? fields[n] : undefined) };
    }
}

test("effective roles: claims union, and team roles union in", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fixture.Config());
    const roles = e.EffectiveRoles(Fixture.Principal([["dept", "eng"], ["r", "user"]]));
    // "user-reader" from claims; "bu-reader" from team t-field (joined via dept=eng)
    assert.equal(roles.has("user-reader"), true);
    assert.equal(roles.has("bu-reader"), true);
});

test("effective level is the max across roles, not first-match", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fixture.Config());
    // claims give user-reader (User) and bu-reader (BU) for the same action/concept
    const level = e.EffectiveLevel(Fixture.Principal([["r", "user"], ["r2", "bu"]]), PrivilegeAction.Read, Order);
    assert.equal(level, AccessLevel.BusinessUnit);
});

test("no granting role yields None; a different action/concept does not leak", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fixture.Config());
    assert.equal(e.EffectiveLevel(Fixture.Principal([]), PrivilegeAction.Read, Order), AccessLevel.None);
    const reader = Fixture.Principal([["r", "user"]]);
    assert.equal(e.EffectiveLevel(reader, PrivilegeAction.Delete, Order), AccessLevel.None);
    assert.equal(e.EffectiveLevel(reader, PrivilegeAction.Read, "shop.Other"), AccessLevel.None);
});

test("override clears direct roles yet team roles remain", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fixture.Config({
        roleAssignment:
        {
            claimsMapping: [{ claim: "r", value: "org", roles: ["org-reader"] }],
            overrides: [{ principalId: "u1", roles: [] }],
            teamRoles: [{ teamId: "t-field", roles: ["bu-reader"] }],
        },
    }));
    // u1 matches dept=eng (team t-field) and r=org (would grant org-reader), but override clears direct roles.
    const roles = e.EffectiveRoles(Fixture.Principal([["dept", "eng"], ["r", "org"]]));
    assert.equal(roles.has("org-reader"), false);
    assert.equal(roles.has("bu-reader"), true);
});

test("Organization allows without consulting ownership", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fixture.Config());
    // org principal, and a view whose concept has NO ownership rule — still allowed
    const p = Fixture.Principal([["r", "org"]]);
    const noRuleView: IInstanceView = { Concept: "shop.NoRule", Field: () => undefined };
    assert.equal(e.EffectiveLevel(p, PrivilegeAction.Read, "shop.NoRule"), AccessLevel.None); // no privilege for that concept
    // grant org on that concept explicitly:
    const e2 = AccessDepthEvaluator.FromConfig(Fixture.Config({
        roles: [{ id: "org-any", name: "Org Any", privileges: [{ action: PrivilegeAction.Read, concept: "shop.NoRule", level: AccessLevel.Organization }] }],
        roleAssignment: { claimsMapping: [{ claim: "r", value: "org", roles: ["org-any"] }], overrides: [], teamRoles: [] },
    }));
    assert.equal(e2.Allows(p, PrivilegeAction.Read, noRuleView), true);
});

test("User level: principal-owned allowed; unowned and other-owned denied", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fixture.Config());
    const userOnly = Fixture.Principal([["r", "user"]]); // only user-reader (User); no dept claim => no team
    assert.equal(e.Allows(userOnly, PrivilegeAction.Read, Fixture.View({ owner: "u1", bu: "sales" })), true);       // owned by the principal
    assert.equal(e.Allows(userOnly, PrivilegeAction.Read, Fixture.View({ owner: "someone", bu: "sales" })), false); // other-owned
    assert.equal(e.Allows(userOnly, PrivilegeAction.Read, Fixture.View({ bu: "sales" })), false);                   // unowned (no owner field)
});

test("User level: a record owned by a team the principal is on is allowed", () =>
{
    // The team grants a User-level role; the principal joins the team via membership (dept=eng)
    // and therefore holds ONLY User level — so this exercises the User-branch team-owned match.
    const e = AccessDepthEvaluator.FromConfig(Fixture.Config({
        roleAssignment: { claimsMapping: [], overrides: [], teamRoles: [{ teamId: "t-field", roles: ["user-reader"] }] },
    }));
    const p = Fixture.Principal([["dept", "eng"]]); // joins t-field; effective role = user-reader (User) via the team
    assert.equal(e.EffectiveLevel(p, PrivilegeAction.Read, Order), AccessLevel.User);
    assert.equal(e.Allows(p, PrivilegeAction.Read, Fixture.View({ owner: "t-field", bu: "sales" })), true);  // owned by a team the principal is on
    assert.equal(e.Allows(p, PrivilegeAction.Read, Fixture.View({ owner: "someone", bu: "sales" })), false); // not the principal nor their team
});

test("BusinessUnit level: home BU and team BU are in reach; a sibling BU is not", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fixture.Config());
    const p = Fixture.Principal([["dept", "eng"], ["r2", "bu"]]); // home eng, team t-field (BU field); bu-reader (BU)
    assert.equal(e.Allows(p, PrivilegeAction.Read, Fixture.View({ owner: "x", bu: "eng" })), true);    // home BU
    assert.equal(e.Allows(p, PrivilegeAction.Read, Fixture.View({ owner: "x", bu: "field" })), true);  // team BU widens reach
    assert.equal(e.Allows(p, PrivilegeAction.Read, Fixture.View({ owner: "x", bu: "sales" })), false); // sibling, not in reach
    assert.equal(e.Allows(p, PrivilegeAction.Read, Fixture.View({ owner: "x", bu: "web" })), false);   // child of home, NOT exact (BU level is exact match)
});

test("BusinessUnitAndChildren: subtree of home BU and of a team BU; unrelated denied", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fixture.Config({
        roleAssignment:
        {
            claimsMapping: [{ claim: "r", value: "children", roles: ["children-reader"] }],
            overrides: [],
            teamRoles: [{ teamId: "t-field", roles: ["children-reader"] }],
        },
    }));
    const p = Fixture.Principal([["dept", "eng"], ["r", "children"]]); // home eng, team field; children-reader
    assert.equal(e.Allows(p, PrivilegeAction.Read, Fixture.View({ owner: "x", bu: "web" })), true);        // child of home eng
    assert.equal(e.Allows(p, PrivilegeAction.Read, Fixture.View({ owner: "x", bu: "field-west" })), true); // child of team BU field
    assert.equal(e.Allows(p, PrivilegeAction.Read, Fixture.View({ owner: "x", bu: "sales" })), false);     // unrelated
});

test("absent role layer denies everything", () =>
{
    const e = AccessDepthEvaluator.FromConfig(Fixture.Config({ roles: undefined, roleAssignment: undefined }));
    const p = Fixture.Principal([["dept", "eng"], ["r", "org"]]);
    assert.equal(e.EffectiveLevel(p, PrivilegeAction.Read, Order), AccessLevel.None);
    assert.equal(e.Allows(p, PrivilegeAction.Read, Fixture.View({ owner: "u1", bu: "eng" })), false);
});

test("fail-closed: malformed roles throw MalformedRolesError", () =>
{
    assert.throws(() => AccessDepthEvaluator.FromConfig(Fixture.Config({
        roles: [
            { id: "dup", name: "A", privileges: [] },
            { id: "dup", name: "B", privileges: [] },
        ],
        roleAssignment: { claimsMapping: [], overrides: [], teamRoles: [] },
    })), MalformedRolesError);

    assert.throws(() => AccessDepthEvaluator.FromConfig(Fixture.Config({
        roles: [{ id: "r", name: "R", privileges: [{ action: PrivilegeAction.Read, concept: "", level: AccessLevel.User }] }],
        roleAssignment: { claimsMapping: [], overrides: [], teamRoles: [] },
    })), MalformedRolesError);

    assert.throws(() => AccessDepthEvaluator.FromConfig(Fixture.Config({
        roles: [{ id: "r", name: "R", privileges: [{ action: "bogus" as PrivilegeAction, concept: Order, level: AccessLevel.User }] }],
        roleAssignment: { claimsMapping: [], overrides: [], teamRoles: [] },
    })), MalformedRolesError);

    assert.throws(() => AccessDepthEvaluator.FromConfig(Fixture.Config({
        roles: [{ id: "r", name: "R", privileges: [{ action: PrivilegeAction.Read, concept: Order, level: "bogus" as AccessLevel }] }],
        roleAssignment: { claimsMapping: [], overrides: [], teamRoles: [] },
    })), MalformedRolesError);

    assert.throws(() => AccessDepthEvaluator.FromConfig(Fixture.Config({
        roleAssignment: { claimsMapping: [{ claim: "r", value: "x", roles: ["ghost"] }], overrides: [], teamRoles: [] },
    })), MalformedRolesError);

    assert.throws(() => AccessDepthEvaluator.FromConfig(Fixture.Config({
        roleAssignment: { claimsMapping: [], overrides: [], teamRoles: [{ teamId: "ghost", roles: ["user-reader"] }] },
    })), MalformedRolesError);
});

test("SP-2 malformed config still throws SP-2's error through FromConfig", () =>
{
    assert.throws(() => AccessDepthEvaluator.FromConfig(Fixture.Config({ businessUnits: [] })), MalformedBusinessUnitTreeError);
});
