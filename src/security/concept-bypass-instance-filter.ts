import type { IInstanceFilter, IInstanceView } from "@pragmatic-tech-ai/todl";

// Lets a fixed set of concepts pass unconditionally; every other concept is decided by the inner filter.
export class ConceptBypassInstanceFilter implements IInstanceFilter
{
    public constructor(
        private readonly inner: IInstanceFilter,
        private readonly bypass: ReadonlySet<string>)
    {
    }

    public Keep(view: IInstanceView): boolean
    {
        return this.bypass.has(view.Concept) ? true : this.inner.Keep(view);
    }
}
