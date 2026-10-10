import { AccessContext, AccessDecision, Action, ResourceAuthorizationPolicy } from "@pragmatic-tech-ai/todl-identity";
import type { IAccessPolicy, EntityPredicate, ResourceRef } from "@pragmatic-tech-ai/todl-identity";
import { PolicyCatalog, PolicyActionKind } from "../policy/policy-catalog.js";
import { PolicyPredicateCompiler } from "../policy/policy-predicate-compiler.js";

/** Fuses resource-level RBAC (delegated, deny-by-default) with compiled per-concept entity filters. */
export class FusionAccessPolicy implements IAccessPolicy
{
    private static readonly AllowAll: EntityPredicate = { Matches: () => true };

    private readonly resourcePolicy: IAccessPolicy;

    public constructor(private readonly catalog: PolicyCatalog, resourcePolicy?: IAccessPolicy)
    {
        this.resourcePolicy = resourcePolicy ?? new ResourceAuthorizationPolicy();
    }

    public Decide(context: AccessContext, action: Action, resource: ResourceRef): AccessDecision
    {
        return this.resourcePolicy.Decide(context, action, resource);
    }

    public EntityFilterFor(context: AccessContext, action: Action, concept: string): EntityPredicate
    {
        const mapped = FusionAccessPolicy.MapAction(action);
        if (mapped === undefined)
        {
            return FusionAccessPolicy.AllowAll;
        }
        const rules = this.catalog.RulesFor(concept);
        if (rules.length === 0)
        {
            return FusionAccessPolicy.AllowAll;
        }
        return PolicyPredicateCompiler.CompileRuleSet(rules, mapped, context.Principal);
    }

    private static MapAction(action: Action): PolicyActionKind | undefined
    {
        switch (action)
        {
            case Action.Read:
                return PolicyActionKind.Read;
            case Action.Write:
                return PolicyActionKind.Write;
            default:
                return undefined;
        }
    }
}
