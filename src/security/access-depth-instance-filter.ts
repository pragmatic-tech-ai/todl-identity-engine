import type { IInstanceFilter, IInstanceView } from "@pragmatic-tech-ai/todl";
import type { Principal, PrivilegeAction } from "@pragmatic-tech-ai/todl-identity";
import type { AccessDepthEvaluator } from "./access-depth-evaluator.js";

// Adapts the access-depth evaluator to the per-instance read seam, fixing one action (Read on the read path).
export class AccessDepthInstanceFilter implements IInstanceFilter
{
    public constructor(
        private readonly evaluator: AccessDepthEvaluator,
        private readonly principal: Principal,
        private readonly action: PrivilegeAction)
    {
    }

    public Keep(view: IInstanceView): boolean
    {
        return this.evaluator.Allows(this.principal, this.action, view);
    }
}
