import type { IInstanceFilter, IInstanceView } from "@pragmatic-tech-ai/todl";

// Deny-wins AND of its parts: keeps an instance only when every part keeps it. Empty ⇒ keep.
export class CompositeInstanceFilter implements IInstanceFilter
{
    public constructor(private readonly filters: readonly IInstanceFilter[])
    {
    }

    public Keep(view: IInstanceView): boolean
    {
        for (const filter of this.filters)
        {
            if (!filter.Keep(view))
            {
                return false;
            }
        }
        return true;
    }
}
