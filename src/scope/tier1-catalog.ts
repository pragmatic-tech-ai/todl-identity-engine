import { BindingTable, type IBindingDescription, type IDefinitionDescription, type ISchemaDescription } from "@pragmatic-tech-ai/graph";

/** What the tier-1 compiler reads of an environment's catalog; TODL's `IEnvironmentCatalog` satisfies it structurally. */
export interface ITier1Catalog
{
    readonly Description: ISchemaDescription;
    /** Concept full name → the package model id that declares it. */
    readonly HomeModels: ReadonlyMap<string, string>;
}

/** Which concepts of a catalog the engine stores, and so the platform's security model governs (spec §5, §6). */
export class Tier1Catalog
{
    /**
     * Every non-aspect definition no external connector holds. A definition's connector resolves as BindingTable does
     * for a node owned by its home model: the most specific binding wins (one for the concept, then its ancestors, then
     * the aspects carried, nearest first), then the home model's model-wide binding, then the description's
     * DefaultConnector. It is engine-stored iff that connector is engine-only (BindingTable.IsEngineOnly: none, or
     * BindingTable.EngineStorage, which environment catalogs set as their default); any other connector is external.
     * A concept with no known home matches bindings of any model.
     */
    public static EngineStoredConcepts(catalog: ITier1Catalog): ReadonlySet<string>
    {
        const byName = new Map<string, IDefinitionDescription>(catalog.Description.Definitions.map(d => [d.Name, d]));
        const out = new Set<string>();
        for (const definition of catalog.Description.Definitions)
        {
            if (!definition.IsAspect && BindingTable.IsEngineOnly(Tier1Catalog.Resolve(catalog, byName, definition.Name)))
            {
                out.add(definition.Name);
            }
        }
        return out;
    }

    private static Resolve(catalog: ITier1Catalog, byName: ReadonlyMap<string, IDefinitionDescription>, concept: string): string | undefined
    {
        const description = catalog.Description;
        const home = catalog.HomeModels.get(concept);
        const owned = description.Bindings.filter(b => home === undefined || b.Model === home);
        for (const link of Tier1Catalog.Chain(byName, concept))
        {
            const bound = owned.find(b => b.Concept === link);
            if (bound !== undefined)
            {
                return bound.Connector;
            }
        }
        const modelWide: IBindingDescription | undefined = home === undefined ? undefined : owned.find(b => b.Concept === undefined);
        return modelWide !== undefined ? modelWide.Connector : description.DefaultConnector;
    }

    /** The concept, its ancestors from the parent up, then each one's declared aspects (each followed by its includes, depth first), each name once. */
    private static Chain(byName: ReadonlyMap<string, IDefinitionDescription>, concept: string): readonly string[]
    {
        const lineage: string[] = [];
        for (let name: string | null = concept; name !== null && !lineage.includes(name); name = byName.get(name)?.Parent ?? null)
        {
            lineage.push(name);
        }
        const chain = [...lineage];
        for (const name of lineage)
        {
            for (const aspect of byName.get(name)?.Aspects ?? [])
            {
                Tier1Catalog.AddAspect(byName, aspect, chain);
            }
        }
        return chain;
    }

    private static AddAspect(byName: ReadonlyMap<string, IDefinitionDescription>, aspect: string, chain: string[]): void
    {
        if (chain.includes(aspect)) return;
        chain.push(aspect);
        for (const included of byName.get(aspect)?.Aspects ?? [])
        {
            Tier1Catalog.AddAspect(byName, included, chain);
        }
    }
}
