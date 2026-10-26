import { test } from "node:test";
import assert from "node:assert/strict";
import type { IInstanceFilter, IInstanceView } from "@pragmatic-tech-ai/todl";
import { ConceptBypassInstanceFilter } from "../concept-bypass-instance-filter.js";

class StubFilter implements IInstanceFilter
{
    public readonly calls: string[] = [];

    public constructor(private readonly result: boolean)
    {
    }

    public Keep(view: IInstanceView): boolean
    {
        this.calls.push(view.Concept);
        return this.result;
    }
}

class Fixture
{
    public static View(concept: string): IInstanceView
    {
        return { Concept: concept } as unknown as IInstanceView;
    }
}

test("bypassed concept passes even when the inner filter rejects", () =>
{
    const inner = new StubFilter(false);
    const filter = new ConceptBypassInstanceFilter(inner, new Set(["app.Secret"]));
    assert.equal(filter.Keep(Fixture.View("app.Secret")), true);
    assert.deepEqual(inner.calls, []);
});

test("non-bypassed concept delegates to the inner filter", () =>
{
    const keep = new ConceptBypassInstanceFilter(new StubFilter(true), new Set(["app.Secret"]));
    const drop = new ConceptBypassInstanceFilter(new StubFilter(false), new Set(["app.Secret"]));
    assert.equal(keep.Keep(Fixture.View("shop.Order")), true);
    assert.equal(drop.Keep(Fixture.View("shop.Order")), false);
});

test("empty bypass set is a pass-through", () =>
{
    const inner = new StubFilter(false);
    const filter = new ConceptBypassInstanceFilter(inner, new Set<string>());
    assert.equal(filter.Keep(Fixture.View("shop.Order")), false);
    assert.deepEqual(inner.calls, ["shop.Order"]);
});
