import type { IInstanceFilter } from "@pragmatic-tech-ai/todl";

// The inactive read filter: keeps every instance. (TS permits implementing Keep(view) with no parameter.)
export class AllowAllInstanceFilter implements IInstanceFilter
{
    public Keep(): boolean
    {
        return true;
    }
}
