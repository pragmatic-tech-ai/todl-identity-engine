import { MetaKind, Builder, Repository, PolicyPredicateCodec } from "@pragmatic-tech-ai/todl";
import type { Node, PolicyPredicate } from "@pragmatic-tech-ai/todl";

export enum PolicyEffect
{
    Allow,
    Deny,
}

export enum PolicyActionKind
{
    Read,
    Write,
}

export interface PolicyRule
{
    readonly Effect: PolicyEffect;
    readonly Action: PolicyActionKind;
    readonly Predicate: PolicyPredicate;
}

interface SerializedRule
{
    readonly effect: string;
    readonly action: string;
    readonly predicate: unknown;
}

export class PolicyCatalog
{
    private static readonly AllowToken = "allow";
    private static readonly DenyToken = "deny";
    private static readonly ReadToken = "read";
    private static readonly WriteToken = "write";

    private constructor(private readonly rulesByConcept: ReadonlyMap<string, readonly PolicyRule[]>)
    {
    }

    public static FromRepository(repo: Repository): PolicyCatalog
    {
        const byConcept = new Map<string, readonly PolicyRule[]>();
        for (const id of repo.nodesOfMetaKind(MetaKind.Policy))
        {
            const node: Node | undefined = repo.resolve(id);
            if (node === undefined) continue;
            const concept = node.attrs.get(Builder.PolicyConceptAttr);
            const rulesRaw = node.attrs.get(Builder.PolicyRulesAttr);
            if (concept === undefined || rulesRaw === undefined)
            {
                throw new Error(`policy node "${id}" is missing concept or rules`);
            }
            byConcept.set(String(concept), PolicyCatalog.ParseRules(String(rulesRaw), String(concept)));
        }
        return new PolicyCatalog(byConcept);
    }

    public RulesFor(concept: string): readonly PolicyRule[]
    {
        return this.rulesByConcept.get(concept) ?? [];
    }

    public Concepts(): readonly string[]
    {
        return [...this.rulesByConcept.keys()];
    }

    private static ParseRules(rulesJson: string, concept: string): readonly PolicyRule[]
    {
        const parsed = JSON.parse(rulesJson) as SerializedRule[];
        return parsed.map((entry) => ({
            Effect: PolicyCatalog.EffectOf(entry.effect, concept),
            Action: PolicyCatalog.ActionOf(entry.action, concept),
            Predicate: PolicyPredicateCodec.FromJson(JSON.stringify(entry.predicate)),
        }));
    }

    private static EffectOf(token: string, concept: string): PolicyEffect
    {
        if (token === PolicyCatalog.AllowToken) return PolicyEffect.Allow;
        if (token === PolicyCatalog.DenyToken) return PolicyEffect.Deny;
        throw new Error(`policy for "${concept}" has unknown effect "${token}"`);
    }

    private static ActionOf(token: string, concept: string): PolicyActionKind
    {
        if (token === PolicyCatalog.ReadToken) return PolicyActionKind.Read;
        if (token === PolicyCatalog.WriteToken) return PolicyActionKind.Write;
        throw new Error(`policy for "${concept}" has unknown action "${token}"`);
    }
}
