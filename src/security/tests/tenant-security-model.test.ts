import { test } from "node:test";
import assert from "node:assert/strict";
import { Principal, PrincipalKind, OwnershipSourceKind } from "@pragmatic-tech-ai/todl-identity";
import type { ISecurityModelConfig } from "@pragmatic-tech-ai/todl-identity";
import { TenantSecurityModel, MalformedSecurityModelError } from "../tenant-security-model.js";
import { MalformedBusinessUnitTreeError } from "../business-unit-hierarchy.js";

class Fixture
{
    public static Valid(): ISecurityModelConfig
    {
        return {
            businessUnits: [{ id: "root", name: "Root" }, { id: "eng", name: "Eng", parent: "root" }],
            teams: [{ id: "t-web", name: "Web", owningBusinessUnit: "eng" }],
            membership: { claimsMapping: [{ claim: "dept", value: "eng", homeBusinessUnit: "eng", teams: ["t-web"] }], overrides: [] },
            ownershipRules: [{ concept: "shop.Order", owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "eng" } }],
        };
    }
}

test("Empty() is a synthetic flat org", () =>
{
    const model = TenantSecurityModel.Empty();
    assert.equal(model.Hierarchy().RootId(), TenantSecurityModel.DefaultRootBusinessUnitId);
    const anyone = new Principal("u1", "t1", PrincipalKind.User, new Map(), []);
    assert.equal(model.Membership().Resolve(anyone).homeBusinessUnit, TenantSecurityModel.DefaultRootBusinessUnitId);
    assert.equal(model.Ownership().Resolve({ Concept: "x.Y", Field: () => undefined }).owningBusinessUnit, TenantSecurityModel.DefaultRootBusinessUnitId);
});

test("FromConfig on a valid model exposes all three primitives", () =>
{
    const model = TenantSecurityModel.FromConfig(Fixture.Valid());
    assert.equal(model.Hierarchy().Has("eng"), true);
    const p = new Principal("u1", "t1", PrincipalKind.User, new Map([["dept", "eng"]]), []);
    assert.equal(model.Membership().Resolve(p).homeBusinessUnit, "eng");
    assert.equal(model.Ownership().Resolve({ Concept: "shop.Order", Field: () => undefined }).owningBusinessUnit, "eng");
});

test("present-but-empty businessUnits fails closed", () =>
{
    assert.throws(() => TenantSecurityModel.FromConfig({ ...Fixture.Valid(), businessUnits: [] }), MalformedBusinessUnitTreeError);
});

test("team owning an unknown BU fails closed", () =>
{
    assert.throws(() => TenantSecurityModel.FromConfig({ ...Fixture.Valid(), teams: [{ id: "t-x", name: "X", owningBusinessUnit: "ghost" }] }), MalformedSecurityModelError);
});

test("duplicate team id fails closed", () =>
{
    assert.throws(() => TenantSecurityModel.FromConfig({ ...Fixture.Valid(), teams: [{ id: "t", name: "A" }, { id: "t", name: "B" }] }), MalformedSecurityModelError);
});

test("membership referencing an unknown BU or team fails closed", () =>
{
    assert.throws(() => TenantSecurityModel.FromConfig({ ...Fixture.Valid(), membership: { claimsMapping: [{ claim: "d", value: "v", homeBusinessUnit: "ghost" }], overrides: [] } }), MalformedSecurityModelError);
    assert.throws(() => TenantSecurityModel.FromConfig({ ...Fixture.Valid(), membership: { claimsMapping: [{ claim: "d", value: "v", teams: ["ghost"] }], overrides: [] } }), MalformedSecurityModelError);
});

test("ownership rule problems fail closed", () =>
{
    assert.throws(() => TenantSecurityModel.FromConfig({ ...Fixture.Valid(), ownershipRules: [
        { concept: "shop.Order", owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "eng" } },
        { concept: "shop.Order", owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "root" } },
    ] }), MalformedSecurityModelError);

    assert.throws(() => TenantSecurityModel.FromConfig({ ...Fixture.Valid(), ownershipRules: [{ concept: "shop.Order", owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "ghost" } }] }), MalformedSecurityModelError);

    assert.throws(() => TenantSecurityModel.FromConfig({ ...Fixture.Valid(), ownershipRules: [{ concept: "shop.Order", owningBusinessUnit: { kind: "bogus" as OwnershipSourceKind, value: "eng" } }] }), MalformedSecurityModelError);

    assert.throws(() => TenantSecurityModel.FromConfig({ ...Fixture.Valid(), ownershipRules: [{ concept: "", owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "eng" } }] }), MalformedSecurityModelError);
});

test("an override referencing an unknown BU or team fails closed", () =>
{
    assert.throws(() => TenantSecurityModel.FromConfig({ ...Fixture.Valid(), membership: { claimsMapping: [], overrides: [{ principalId: "u1", homeBusinessUnit: "ghost" }] } }), MalformedSecurityModelError);
    assert.throws(() => TenantSecurityModel.FromConfig({ ...Fixture.Valid(), membership: { claimsMapping: [], overrides: [{ principalId: "u1", teams: ["ghost"] }] } }), MalformedSecurityModelError);
});

test("an empty ownership source value fails closed", () =>
{
    assert.throws(() => TenantSecurityModel.FromConfig({ ...Fixture.Valid(), ownershipRules: [{ concept: "shop.Order", owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "" } }] }), MalformedSecurityModelError);
});

test("an owner source with a bogus kind fails closed", () =>
{
    assert.throws(() => TenantSecurityModel.FromConfig({ ...Fixture.Valid(), ownershipRules: [{ concept: "shop.Order", owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "eng" }, owner: { kind: "bogus" as OwnershipSourceKind, value: "x" } }] }), MalformedSecurityModelError);
});

test("a Fixed owner value is accepted without hierarchy validation", () =>
{
    const model = TenantSecurityModel.FromConfig({ ...Fixture.Valid(), ownershipRules: [{ concept: "shop.Order", owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "eng" }, owner: { kind: OwnershipSourceKind.Fixed, value: "not-a-bu" } }] });
    assert.equal(model.Ownership().Resolve({ Concept: "shop.Order", Field: () => undefined }).owner, "not-a-bu");
});
