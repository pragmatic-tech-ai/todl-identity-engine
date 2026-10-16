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
        const owningBusinessUnit = this.OwningBusinessUnit(rule.owningBusinessUnit, view);
        const owner = this.Owner(rule.owner, view);
        if (owner === undefined)
        {
            return { owningBusinessUnit };
        }
        return { owningBusinessUnit, owner };
    }

    public OwnerField(concept: string): string | undefined
    {
        const rule = this.rulesByConcept.get(concept);
        if (rule === undefined || rule.owner === undefined || rule.owner.kind !== OwnershipSourceKind.FromField)
        {
            return undefined;
        }
        return rule.owner.value;
    }

    public BusinessUnitField(concept: string): string | undefined
    {
        const rule = this.rulesByConcept.get(concept);
        if (rule === undefined || rule.owningBusinessUnit.kind !== OwnershipSourceKind.FromField)
        {
            return undefined;
        }
        return rule.owningBusinessUnit.value;
    }

    public CreateFieldDefaults(concept: string, owner: string, owningBusinessUnit: string): readonly { field: string; value: string }[]
    {
        const rule = this.rulesByConcept.get(concept);
        if (rule === undefined)
        {
            return [];
        }
        const defaults: { field: string; value: string }[] = [];
        if (rule.owner !== undefined && rule.owner.kind === OwnershipSourceKind.FromField)
        {
            defaults.push({ field: rule.owner.value, value: owner });
        }
        if (rule.owningBusinessUnit.kind === OwnershipSourceKind.FromField)
        {
            defaults.push({ field: rule.owningBusinessUnit.value, value: owningBusinessUnit });
        }
        return defaults;
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
