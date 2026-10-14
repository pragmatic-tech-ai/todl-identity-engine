import { test } from "node:test";
import assert from "node:assert/strict";
import type { IBusinessUnitConfig } from "@pragmatic-tech-ai/todl-identity";
import { BusinessUnitHierarchy, MalformedBusinessUnitTreeError } from "../business-unit-hierarchy.js";

class Tree
{
    // root → { eng → { web, mobile }, sales }
    public static Valid(): IBusinessUnitConfig[]
    {
        return [
            { id: "root", name: "Root" },
            { id: "eng", name: "Engineering", parent: "root" },
            { id: "web", name: "Web", parent: "eng" },
            { id: "mobile", name: "Mobile", parent: "eng" },
            { id: "sales", name: "Sales", parent: "root" },
        ];
    }
}

test("valid tree exposes its single root and membership", () =>
{
    const h = BusinessUnitHierarchy.FromConfig(Tree.Valid());
    assert.equal(h.RootId(), "root");
    assert.equal(h.Has("web"), true);
    assert.equal(h.Has("missing"), false);
});

test("AncestorsOf is nearest-first and excludes self", () =>
{
    const h = BusinessUnitHierarchy.FromConfig(Tree.Valid());
    assert.deepEqual(h.AncestorsOf("web"), ["eng", "root"]);
    assert.deepEqual(h.AncestorsOf("root"), []);
});

test("DescendantsOf excludes self and covers the subtree", () =>
{
    const h = BusinessUnitHierarchy.FromConfig(Tree.Valid());
    assert.deepEqual([...h.DescendantsOf("eng")].sort(), ["mobile", "web"]);
    assert.deepEqual(h.DescendantsOf("web"), []);
});

test("Contains is reflexive and true only within the subtree", () =>
{
    const h = BusinessUnitHierarchy.FromConfig(Tree.Valid());
    assert.equal(h.Contains("eng", "eng"), true);
    assert.equal(h.Contains("eng", "web"), true);
    assert.equal(h.Contains("eng", "sales"), false);
    assert.equal(h.Contains("web", "eng"), false);
});

test("empty tree is malformed", () =>
{
    assert.throws(() => BusinessUnitHierarchy.FromConfig([]), MalformedBusinessUnitTreeError);
});

test("a dangling parent is malformed", () =>
{
    assert.throws(() => BusinessUnitHierarchy.FromConfig([{ id: "a", name: "A", parent: "ghost" }]), MalformedBusinessUnitTreeError);
});

test("two roots are malformed", () =>
{
    assert.throws(() => BusinessUnitHierarchy.FromConfig([{ id: "a", name: "A" }, { id: "b", name: "B" }]), MalformedBusinessUnitTreeError);
});

test("a cycle is malformed", () =>
{
    const units: IBusinessUnitConfig[] =
    [
        { id: "root", name: "Root" },
        { id: "a", name: "A", parent: "b" },
        { id: "b", name: "B", parent: "a" },
    ];
    assert.throws(() => BusinessUnitHierarchy.FromConfig(units), MalformedBusinessUnitTreeError);
});

test("a duplicate id is malformed", () =>
{
    assert.throws(() => BusinessUnitHierarchy.FromConfig([{ id: "root", name: "Root" }, { id: "root", name: "Dup" }]), MalformedBusinessUnitTreeError);
});
