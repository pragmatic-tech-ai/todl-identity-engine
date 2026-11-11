import type { ISchemaDescription } from "@pragmatic-tech-ai/graph";

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
     * Every non-aspect definition no connector holds. A definition is external iff a binding names it, or a model-wide
     * binding names its home model, or no binding matches it and the description has a default connector.
     */
    public static EngineStoredConcepts(catalog: ITier1Catalog): ReadonlySet<string>
    {
        const out = new Set<string>();
        for (const definition of catalog.Description.Definitions)
        {
            if (!definition.IsAspect && !Tier1Catalog.IsExternal(catalog, definition.Name))
            {
                out.add(definition.Name);
            }
        }
        return out;
    }

    private static IsExternal(catalog: ITier1Catalog, concept: string): boolean
    {
        const description = catalog.Description;
        const home = catalog.HomeModels.get(concept);
        const matched = description.Bindings.some(b => b.Concept === concept || (b.Concept === undefined && home !== undefined && b.Model === home));
        return matched || description.DefaultConnector !== undefined;
    }
}
