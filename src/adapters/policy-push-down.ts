import { PolicyNodeKind, PolicyRefRoot, PolicyCompareOp, PolicyBoolOp, QueryCompareOp } from "@pragmatic-tech-ai/todl";
import type { PolicyPredicate, PolicyOperand, PolicyCompare, PolicyRef, QueryFilter, QueryComparison, ExternalFieldValue } from "@pragmatic-tech-ai/todl";
import type { Principal } from "@pragmatic-tech-ai/todl-identity";
import { PolicyEffect } from "../policy/policy-catalog.js";
import type { PolicyRule, PolicyActionKind } from "../policy/policy-catalog.js";

/**
 * Sound query push-down. The returned filter is only emitted when the fused policy for
 * (concept, action) is exactly a pure AND of entity-vs-constant ==/!= comparisons; anything
 * unclear yields undefined so the authoritative in-memory filter decides everything.
 */
export class PolicyPushDown
{
    public static EligibleFilter(rules: readonly PolicyRule[], action: PolicyActionKind, principal: Principal): QueryFilter | undefined
    {
        const forAction = rules.filter((r) => r.Action === action);
        const allows = forAction.filter((r) => r.Effect === PolicyEffect.Allow);
        const denies = forAction.filter((r) => r.Effect === PolicyEffect.Deny);
        if (allows.length > 1) return undefined;
        if (allows.length === 0 && denies.length === 0) return undefined;

        const all: QueryComparison[] = [];
        for (const allow of allows)
        {
            const leaves = PolicyPushDown.Conjuncts(allow.Predicate);
            if (leaves === undefined) return undefined;
            for (const leaf of leaves)
            {
                const cmp = PolicyPushDown.AsComparison(leaf, false, principal);
                if (cmp === undefined) return undefined;
                all.push(cmp);
            }
        }
        for (const deny of denies)
        {
            const leaves = PolicyPushDown.Conjuncts(deny.Predicate);
            if (leaves === undefined || leaves.length !== 1) return undefined;
            const cmp = PolicyPushDown.AsComparison(leaves[0], true, principal);
            if (cmp === undefined) return undefined;
            all.push(cmp);
        }
        // Eq-only: the in-memory predicate uses JS !==, so a null/missing field on a Neq is TRUE (row kept),
        // while the connector's SQL three-valued logic drops null for Neq. Pushing a Neq would hide admitted
        // rows; only Eq agrees on nulls. Dropped conjuncts widen to a sound superset the in-memory filter trims.
        const eqOnly = all.filter((c) => c.Op === QueryCompareOp.Eq);
        if (eqOnly.length === 0) return undefined;
        return { All: eqOnly };
    }

    private static Conjuncts(predicate: PolicyPredicate): PolicyPredicate[] | undefined
    {
        if (predicate.kind === PolicyNodeKind.Compare) return [predicate];
        if (predicate.kind === PolicyNodeKind.Bool && predicate.op === PolicyBoolOp.And)
        {
            const left = PolicyPushDown.Conjuncts(predicate.left);
            const right = PolicyPushDown.Conjuncts(predicate.right);
            if (left === undefined || right === undefined) return undefined;
            return [...left, ...right];
        }
        return undefined;
    }

    private static AsComparison(node: PolicyPredicate, negate: boolean, principal: Principal): QueryComparison | undefined
    {
        if (node.kind !== PolicyNodeKind.Compare) return undefined;
        const compare: PolicyCompare = node;
        const leftEntity = PolicyPushDown.EntityMember(compare.left);
        const rightEntity = PolicyPushDown.EntityMember(compare.right);
        if ((leftEntity === undefined) === (rightEntity === undefined)) return undefined;
        const field = leftEntity ?? rightEntity;
        const constant = PolicyPushDown.Constant(leftEntity === undefined ? compare.left : compare.right, principal);
        if (field === undefined || constant === undefined) return undefined;
        const eq = (compare.op === PolicyCompareOp.Eq) !== negate;
        return { Field: field, Op: eq ? QueryCompareOp.Eq : QueryCompareOp.Neq, Value: constant };
    }

    private static EntityMember(operand: PolicyOperand): string | undefined
    {
        if (operand.kind === PolicyNodeKind.Ref && operand.root === PolicyRefRoot.Entity) return operand.member;
        return undefined;
    }

    private static Constant(operand: PolicyOperand, principal: Principal): ExternalFieldValue | undefined
    {
        if (operand.kind === PolicyNodeKind.Literal) return operand.value;
        const ref: PolicyRef = operand;
        if (ref.root !== PolicyRefRoot.Principal) return undefined;
        return principal.Claim(ref.member);
    }
}
