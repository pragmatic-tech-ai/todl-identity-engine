import type { IBusinessUnitConfig } from "@pragmatic-tech-ai/todl-identity";

export class MalformedBusinessUnitTreeError extends Error
{
    public constructor(message: string)
    {
        super(message);
        this.name = new.target.name;
    }
}

export class BusinessUnitHierarchy
{
    private static readonly EmptyMessage = "business-unit tree is empty";
    private static readonly DuplicateMessage = "business-unit id is duplicated: ";
    private static readonly UnknownParentMessage = "business-unit parent does not exist: ";
    private static readonly RootCountMessage = "business-unit tree must have exactly one root, found: ";
    private static readonly CycleMessage = "business-unit tree is not a single connected acyclic tree at: ";
    private static readonly UnknownUnitMessage = "unknown business unit: ";

    private constructor(
        private readonly rootId: string,
        private readonly parents: ReadonlyMap<string, string | undefined>,
        private readonly children: ReadonlyMap<string, readonly string[]>)
    {
    }

    public static FromConfig(units: Iterable<IBusinessUnitConfig>): BusinessUnitHierarchy
    {
        const parents = new Map<string, string | undefined>();
        const list: IBusinessUnitConfig[] = [];
        for (const unit of units)
        {
            if (parents.has(unit.id))
            {
                throw new MalformedBusinessUnitTreeError(BusinessUnitHierarchy.DuplicateMessage + unit.id);
            }
            parents.set(unit.id, unit.parent);
            list.push(unit);
        }
        if (list.length === 0)
        {
            throw new MalformedBusinessUnitTreeError(BusinessUnitHierarchy.EmptyMessage);
        }
        const children = new Map<string, string[]>();
        for (const id of parents.keys())
        {
            children.set(id, []);
        }
        let root: string | undefined = undefined;
        let rootCount = 0;
        for (const unit of list)
        {
            if (unit.parent === undefined)
            {
                root = unit.id;
                rootCount += 1;
                continue;
            }
            const siblings = children.get(unit.parent);
            if (siblings === undefined)
            {
                throw new MalformedBusinessUnitTreeError(BusinessUnitHierarchy.UnknownParentMessage + unit.parent);
            }
            siblings.push(unit.id);
        }
        if (rootCount !== 1 || root === undefined)
        {
            throw new MalformedBusinessUnitTreeError(BusinessUnitHierarchy.RootCountMessage + rootCount);
        }
        BusinessUnitHierarchy.AssertConnectedAcyclic(root, children, parents.size);
        const frozenChildren = new Map<string, readonly string[]>();
        for (const [id, kids] of children)
        {
            frozenChildren.set(id, kids);
        }
        return new BusinessUnitHierarchy(root, parents, frozenChildren);
    }

    // A single-rooted tree reaches every node from the root exactly once; anything else is a cycle
    // or a disconnected component among the non-root nodes.
    private static AssertConnectedAcyclic(root: string, children: ReadonlyMap<string, readonly string[]>, nodeCount: number): void
    {
        const seen = new Set<string>();
        const queue: string[] = [root];
        while (queue.length > 0)
        {
            const id = queue.shift() as string;
            if (seen.has(id))
            {
                throw new MalformedBusinessUnitTreeError(BusinessUnitHierarchy.CycleMessage + id);
            }
            seen.add(id);
            for (const child of children.get(id) ?? [])
            {
                queue.push(child);
            }
        }
        if (seen.size !== nodeCount)
        {
            throw new MalformedBusinessUnitTreeError(BusinessUnitHierarchy.CycleMessage + root);
        }
    }

    public RootId(): string
    {
        return this.rootId;
    }

    public Has(buId: string): boolean
    {
        return this.parents.has(buId);
    }

    public AncestorsOf(buId: string): readonly string[]
    {
        this.AssertKnown(buId);
        const chain: string[] = [];
        let current = this.parents.get(buId);
        while (current !== undefined)
        {
            chain.push(current);
            current = this.parents.get(current);
        }
        return chain;
    }

    public DescendantsOf(buId: string): readonly string[]
    {
        this.AssertKnown(buId);
        const out: string[] = [];
        const queue: string[] = [...(this.children.get(buId) ?? [])];
        while (queue.length > 0)
        {
            const id = queue.shift() as string;
            out.push(id);
            for (const child of this.children.get(id) ?? [])
            {
                queue.push(child);
            }
        }
        return out;
    }

    public Contains(scopeBu: string, targetBu: string): boolean
    {
        this.AssertKnown(scopeBu);
        this.AssertKnown(targetBu);
        if (scopeBu === targetBu)
        {
            return true;
        }
        return this.DescendantsOf(scopeBu).includes(targetBu);
    }

    private AssertKnown(buId: string): void
    {
        if (!this.parents.has(buId))
        {
            throw new MalformedBusinessUnitTreeError(BusinessUnitHierarchy.UnknownUnitMessage + buId);
        }
    }
}
