import type { IInstanceView } from "@pragmatic-tech-ai/todl";
import { OwnershipSourceKind } from "@pragmatic-tech-ai/todl-identity";
import type { IOwnershipRuleConfig, IOwnershipSource } from "@pragmatic-tech-ai/todl-identity";
import type { BusinessUnitHierarchy } from "./business-unit-hierarchy.js";

export interface IOwnership
{
    readonly owningBusinessUnit: string;
    readonly owner?: string;
}

export class OwnershipResolver
{
    private readonly rulesByConcept: ReadonlyMap<string, IOwnershipRuleConfig>;

    public constructor(
        rules: Iterable<IOwnershipRuleConfig>,
        private readonly hierarchy: BusinessUnitHierarchy)
    {
        const map = new Map<string, IOwnershipRuleConfig>();
        for (const rule of rules)
        {
            map.set(rule.concept, rule);
        }
        this.rulesByConcept = map;
    }

    public Resolve(view: IInstanceView): IOwnership
    {
        const rule = this.rulesByConcept.get(view.Concept);
        if (rule === undefined)
        {
            return { owningBusinessUnit: this.hierarchy.RootId() };
        }
        return { owningBusinessUnit: this.OwningBusinessUnit(rule.owningBusinessUnit, view), owner: this.Owner(rule.owner, view) };
    }

    private OwningBusinessUnit(source: IOwnershipSource, view: IInstanceView): string
    {
        if (source.kind === OwnershipSourceKind.Fixed)
        {
            return source.value;
        }
        const derived = OwnershipResolver.FieldId(view, source.value);
        if (derived !== undefined && this.hierarchy.Has(derived))
        {
            return derived;
        }
        return this.hierarchy.RootId();
    }

    private Owner(source: IOwnershipSource | undefined, view: IInstanceView): string | undefined
    {
        if (source === undefined)
        {
            return undefined;
        }
        if (source.kind === OwnershipSourceKind.Fixed)
        {
            return source.value;
        }
        return OwnershipResolver.FieldId(view, source.value);
    }

    private static FieldId(view: IInstanceView, fieldName: string): string | undefined
    {
        const raw = view.Field(fieldName);
        if (raw === undefined)
        {
            return undefined;
        }
        const text = String(raw);
        if (text.length === 0)
        {
            return undefined;
        }
        return text;
    }
}
