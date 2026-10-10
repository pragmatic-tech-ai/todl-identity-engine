import type { IConnectorQueryFilterProvider, QueryFilter } from "@pragmatic-tech-ai/todl";
import { Action } from "@pragmatic-tech-ai/todl-identity";
import type { Principal } from "@pragmatic-tech-ai/todl-identity";
import { PolicyActionKind } from "../policy/policy-catalog.js";
import type { PolicyCatalog } from "../policy/policy-catalog.js";
import { PolicyPushDown } from "./policy-push-down.js";

export class PolicyQueryFilterProvider implements IConnectorQueryFilterProvider
{
    public constructor(
        private readonly catalog: PolicyCatalog,
        private readonly principal: Principal,
        private readonly action: Action)
    {
    }

    public WhereFor(concept: string): QueryFilter | undefined
    {
        const kind = PolicyQueryFilterProvider.KindOf(this.action);
        if (kind === undefined) return undefined;
        return PolicyPushDown.EligibleFilter(this.catalog.RulesFor(concept), kind, this.principal);
    }

    private static KindOf(action: Action): PolicyActionKind | undefined
    {
        if (action === Action.Read) return PolicyActionKind.Read;
        if (action === Action.Write) return PolicyActionKind.Write;
        return undefined;
    }
}
