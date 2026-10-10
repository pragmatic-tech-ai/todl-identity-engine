import type { IInstanceFilter, IInstanceView } from "@pragmatic-tech-ai/todl";
import type { AccessContext, Action, IAccessPolicy, EntityPredicate, EntityView } from "@pragmatic-tech-ai/todl-identity";

/** Authoritative in-memory read gate: enforces the policy's per-concept entity filter on every instance view. */
export class PolicyAccessInstanceFilter implements IInstanceFilter
{
    private readonly cache = new Map<string, EntityPredicate>();

    public constructor(
        private readonly policy: IAccessPolicy,
        private readonly context: AccessContext,
        private readonly action: Action)
    {
    }

    public Keep(view: IInstanceView): boolean
    {
        let predicate = this.cache.get(view.Concept);
        if (predicate === undefined)
        {
            predicate = this.policy.EntityFilterFor(this.context, this.action, view.Concept);
            this.cache.set(view.Concept, predicate);
        }
        const entity: EntityView = { Member: (name: string) => view.Field(name) };
        return predicate.Matches(entity);
    }
}
