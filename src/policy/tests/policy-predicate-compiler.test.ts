import { test } from "node:test";
import assert from "node:assert/strict";
import { PolicyNodeKind, PolicyRefRoot, PolicyBoolOp, PolicyCompareOp } from "@pragmatic-tech-ai/todl";
import type { PolicyPredicate } from "@pragmatic-tech-ai/todl";
import { Principal, PrincipalKind } from "@pragmatic-tech-ai/todl-identity";
import type { EntityView } from "@pragmatic-tech-ai/todl-identity";
import { PolicyPredicateCompiler } from "../policy-predicate-compiler.js";
import { PolicyEffect, PolicyActionKind } from "../policy-catalog.js";
import type { PolicyRule } from "../policy-catalog.js";

class Fixture
{
    public static Principal(): Principal
    {
        return new Principal("u1", "t1", PrincipalKind.User, new Map<string, string>(), ["admins"]);
    }

    public static View(fields: Record<string, unknown>): EntityView
    {
        return { Member: (name: string) => fields[name] };
    }

    public static EntityEq(member: string, value: string): PolicyPredicate
    {
        return {
            kind: PolicyNodeKind.Compare,
            op: PolicyCompareOp.Eq,
            left: { kind: PolicyNodeKind.Ref, root: PolicyRefRoot.Entity, member },
            right: { kind: PolicyNodeKind.Literal, value },
        };
    }

    public static Rule(effect: PolicyEffect, action: PolicyActionKind, predicate: PolicyPredicate): PolicyRule
    {
        return { Effect: effect, Action: action, Predicate: predicate };
    }
}

test("deny overrides allow", () =>
{
    const rules = [
        Fixture.Rule(PolicyEffect.Allow, PolicyActionKind.Read, Fixture.EntityEq("region", "eu")),
        Fixture.Rule(PolicyEffect.Deny, PolicyActionKind.Read, Fixture.EntityEq("tier", "free")),
    ];
    const p = PolicyPredicateCompiler.CompileRuleSet(rules, PolicyActionKind.Read, Fixture.Principal());
    assert.equal(p.Matches(Fixture.View({ region: "eu", tier: "paid" })), true);
    assert.equal(p.Matches(Fixture.View({ region: "us", tier: "paid" })), false);
    assert.equal(p.Matches(Fixture.View({ region: "eu", tier: "free" })), false);
});

test("principal groups membership", () =>
{
    const has = (g: string): PolicyPredicate => ({
        kind: PolicyNodeKind.Membership,
        collection: { kind: PolicyNodeKind.Ref, root: PolicyRefRoot.Principal, member: "groups" },
        item: { kind: PolicyNodeKind.Literal, value: g },
    });
    const view = Fixture.View({});
    assert.equal(PolicyPredicateCompiler.Compile(has("admins"), Fixture.Principal()).Matches(view), true);
    assert.equal(PolicyPredicateCompiler.Compile(has("owners"), Fixture.Principal()).Matches(view), false);
});

test("missing claim compares false without crashing", () =>
{
    const pred: PolicyPredicate = {
        kind: PolicyNodeKind.Compare,
        op: PolicyCompareOp.Eq,
        left: { kind: PolicyNodeKind.Ref, root: PolicyRefRoot.Principal, member: "missing" },
        right: { kind: PolicyNodeKind.Literal, value: "x" },
    };
    assert.equal(PolicyPredicateCompiler.Compile(pred, Fixture.Principal()).Matches(Fixture.View({})), false);
});

test("membership over non-array collection is false", () =>
{
    const pred: PolicyPredicate = {
        kind: PolicyNodeKind.Membership,
        collection: { kind: PolicyNodeKind.Ref, root: PolicyRefRoot.Entity, member: "name" },
        item: { kind: PolicyNodeKind.Literal, value: "a" },
    };
    assert.equal(PolicyPredicateCompiler.Compile(pred, Fixture.Principal()).Matches(Fixture.View({ name: "a" })), false);
});

test("bool and not combinators", () =>
{
    const pred: PolicyPredicate = {
        kind: PolicyNodeKind.Bool,
        op: PolicyBoolOp.Or,
        left: Fixture.EntityEq("a", "1"),
        right: { kind: PolicyNodeKind.Not, operand: Fixture.EntityEq("b", "2") },
    };
    const c = PolicyPredicateCompiler.Compile(pred, Fixture.Principal());
    assert.equal(c.Matches(Fixture.View({ a: "1", b: "2" })), true);
    assert.equal(c.Matches(Fixture.View({ a: "0", b: "2" })), false);
    assert.equal(c.Matches(Fixture.View({ a: "0", b: "3" })), true);
});

test("no rules for the action allows all", () =>
{
    const rules = [Fixture.Rule(PolicyEffect.Allow, PolicyActionKind.Read, Fixture.EntityEq("region", "eu"))];
    const p = PolicyPredicateCompiler.CompileRuleSet(rules, PolicyActionKind.Write, Fixture.Principal());
    assert.equal(p.Matches(Fixture.View({ region: "us" })), true);
});
