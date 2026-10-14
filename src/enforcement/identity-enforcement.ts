import type { IInstanceFilter, IConnectorQueryFilterProvider, Repository } from "@pragmatic-tech-ai/todl";
import type { AccessContext, Action } from "@pragmatic-tech-ai/todl-identity";
import { PolicyCatalog } from "../policy/policy-catalog.js";
import { FusionAccessPolicy } from "../authz/fusion-access-policy.js";
import { PolicyAccessInstanceFilter } from "../adapters/policy-instance-filter.js";
import { PolicyQueryFilterProvider } from "../adapters/policy-query-filter-provider.js";

/**
 * Composition facade: holds the catalog, context and action as the single source of truth and
 * derives both the in-memory instance filter and the query push-down provider from them,
 * so the two enforcement paths can never disagree.
 */
export class IdentityEnforcement
{
    private readonly policy: FusionAccessPolicy;

    public constructor(
        private readonly catalog: PolicyCatalog,
        private readonly context: AccessContext,
        private readonly action: Action)
    {
        this.policy = new FusionAccessPolicy(catalog);
    }

    public static Over(catalog: PolicyCatalog, context: AccessContext, action: Action): IdentityEnforcement
    {
        return new IdentityEnforcement(catalog, context, action);
    }

    public static ForRepository(repo: Repository, context: AccessContext, action: Action): IdentityEnforcement
    {
        return new IdentityEnforcement(PolicyCatalog.FromRepository(repo), context, action);
    }

    public InstanceFilter(): IInstanceFilter
    {
        return new PolicyAccessInstanceFilter(this.policy, this.context, this.action);
    }

    public QueryFilterProvider(): IConnectorQueryFilterProvider
    {
        return new PolicyQueryFilterProvider(this.catalog, this.context.Principal, this.action);
    }

    public Policy(): FusionAccessPolicy
    {
        return this.policy;
    }
}
