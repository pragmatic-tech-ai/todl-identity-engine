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
