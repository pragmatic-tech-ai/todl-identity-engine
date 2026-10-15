import { test } from "node:test";
import assert from "node:assert/strict";
import type { IInstanceView } from "@pragmatic-tech-ai/todl";
import { OwnershipSourceKind } from "@pragmatic-tech-ai/todl-identity";
import type { IOwnershipRuleConfig } from "@pragmatic-tech-ai/todl-identity";
import { BusinessUnitHierarchy } from "../business-unit-hierarchy.js";
import { OwnershipResolver } from "../ownership-resolver.js";

class Fixture
{
    public static Hierarchy(): BusinessUnitHierarchy
    {
        return BusinessUnitHierarchy.FromConfig([
            { id: "root", name: "Root" },
            { id: "eng", name: "Engineering", parent: "root" },
        ]);
    }

    public static View(concept: string, fields: Record<string, string | number | boolean>): IInstanceView
    {
        return { Concept: concept, Field: (n: string) => (n in fields ? fields[n] : undefined) };
    }
}

test("no rule for the concept yields root BU and no owner", () =>
{
    const o = new OwnershipResolver([], Fixture.Hierarchy()).Resolve(Fixture.View("shop.Order", {}));
    assert.equal(o.owningBusinessUnit, "root");
    assert.equal(o.owner, undefined);
});

test("fixed owning BU and fixed owner", () =>
{
    const rule: IOwnershipRuleConfig =
    {
        concept: "shop.Order",
        owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "eng" },
        owner: { kind: OwnershipSourceKind.Fixed, value: "team-eng" },
    };
    const o = new OwnershipResolver([rule], Fixture.Hierarchy()).Resolve(Fixture.View("shop.Order", {}));
    assert.equal(o.owningBusinessUnit, "eng");
    assert.equal(o.owner, "team-eng");
});

test("field-derived owning BU (string and numeric)", () =>
{
    const rule: IOwnershipRuleConfig =
    {
        concept: "shop.Order",
        owningBusinessUnit: { kind: OwnershipSourceKind.FromField, value: "region" },
    };
    assert.equal(new OwnershipResolver([rule], Fixture.Hierarchy()).Resolve(Fixture.View("shop.Order", { region: "eng" })).owningBusinessUnit, "eng");

    const numericHierarchy = BusinessUnitHierarchy.FromConfig([{ id: "root", name: "Root" }, { id: "42", name: "Unit42", parent: "root" }]);
    assert.equal(new OwnershipResolver([rule], numericHierarchy).Resolve(Fixture.View("shop.Order", { region: 42 })).owningBusinessUnit, "42");
});

test("missing or unknown field value falls back to root", () =>
{
    const rule: IOwnershipRuleConfig =
    {
        concept: "shop.Order",
        owningBusinessUnit: { kind: OwnershipSourceKind.FromField, value: "region" },
    };
    const resolver = new OwnershipResolver([rule], Fixture.Hierarchy());
    assert.equal(resolver.Resolve(Fixture.View("shop.Order", {})).owningBusinessUnit, "root");
    assert.equal(resolver.Resolve(Fixture.View("shop.Order", { region: "ghost" })).owningBusinessUnit, "root");
});

test("field-derived owner is carried through even when unknown; missing owner field omits owner", () =>
{
    const rule: IOwnershipRuleConfig =
    {
        concept: "shop.Order",
        owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "eng" },
        owner: { kind: OwnershipSourceKind.FromField, value: "assignee" },
    };
    const resolver = new OwnershipResolver([rule], Fixture.Hierarchy());
    assert.equal(resolver.Resolve(Fixture.View("shop.Order", { assignee: "user-7" })).owner, "user-7");
    assert.equal(resolver.Resolve(Fixture.View("shop.Order", {})).owner, undefined);
});

test("a rule without an owner omits the owner key entirely", () =>
{
    const rule: IOwnershipRuleConfig =
    {
        concept: "shop.Order",
        owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "eng" },
    };
    const o = new OwnershipResolver([rule], Fixture.Hierarchy()).Resolve(Fixture.View("shop.Order", {}));
    assert.deepEqual(o, { owningBusinessUnit: "eng" });
});

test("CreateFieldDefaults: field-backed owner and BU both stamp", () =>
{
    const rule: IOwnershipRuleConfig =
    {
        concept: "shop.Order",
        owningBusinessUnit: { kind: OwnershipSourceKind.FromField, value: "bu" },
        owner: { kind: OwnershipSourceKind.FromField, value: "owner" },
    };
    const out = new OwnershipResolver([rule], Fixture.Hierarchy()).CreateFieldDefaults("shop.Order", "u1", "sales");
    assert.deepEqual(out, [{ field: "owner", value: "u1" }, { field: "bu", value: "sales" }]);
});

test("CreateFieldDefaults: Fixed sources contribute nothing; no rule yields empty", () =>
{
    const rule: IOwnershipRuleConfig =
    {
        concept: "shop.Order",
        owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "eng" },
        owner: { kind: OwnershipSourceKind.Fixed, value: "team-eng" },
    };
    const resolver = new OwnershipResolver([rule], Fixture.Hierarchy());
    assert.deepEqual(resolver.CreateFieldDefaults("shop.Order", "u1", "sales"), []);
    assert.deepEqual(resolver.CreateFieldDefaults("shop.Unknown", "u1", "sales"), []);
});

test("CreateFieldDefaults: field BU only when owner is absent", () =>
{
    const rule: IOwnershipRuleConfig =
    {
        concept: "shop.Order",
        owningBusinessUnit: { kind: OwnershipSourceKind.FromField, value: "bu" },
    };
    const out = new OwnershipResolver([rule], Fixture.Hierarchy()).CreateFieldDefaults("shop.Order", "u1", "sales");
    assert.deepEqual(out, [{ field: "bu", value: "sales" }]);
});

test("CreateFieldDefaults: FromField owner with Fixed BU stamps only the owner", () =>
{
    const rule: IOwnershipRuleConfig =
    {
        concept: "shop.Order",
        owningBusinessUnit: { kind: OwnershipSourceKind.Fixed, value: "eng" },
        owner: { kind: OwnershipSourceKind.FromField, value: "owner" },
    };
    const out = new OwnershipResolver([rule], Fixture.Hierarchy()).CreateFieldDefaults("shop.Order", "u1", "sales");
    assert.deepEqual(out, [{ field: "owner", value: "u1" }]);
});

test("CreateFieldDefaults: Fixed owner with FromField BU stamps only the BU", () =>
{
    const rule: IOwnershipRuleConfig =
    {
        concept: "shop.Order",
        owningBusinessUnit: { kind: OwnershipSourceKind.FromField, value: "bu" },
        owner: { kind: OwnershipSourceKind.Fixed, value: "team-eng" },
    };
    const out = new OwnershipResolver([rule], Fixture.Hierarchy()).CreateFieldDefaults("shop.Order", "u1", "sales");
    assert.deepEqual(out, [{ field: "bu", value: "sales" }]);
});
