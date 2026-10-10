import { QueryCompareOp } from "@pragmatic-tech-ai/todl";
import type { IDataSourceAdapter, IDataSourceAdapterFactory, QueryRequest, ExternalRecord, ResolvedConnection, WriteBatch, WriteResult, DataSourceKind } from "@pragmatic-tech-ai/todl";

export class RecordingAdapter implements IDataSourceAdapter
{
    public readonly Requests: QueryRequest[] = [];
    private readonly sources = new Map<string, ExternalRecord[]>();

    public Seed(source: string, rows: ExternalRecord[]): this
    {
        this.sources.set(source, [...rows]);
        return this;
    }

    public async Query(request: QueryRequest): Promise<readonly ExternalRecord[]>
    {
        this.Requests.push(request);
        const comparisons = request.Where?.All ?? [];
        const rows = (this.sources.get(request.Source) ?? []).filter((row) => comparisons.every((c) =>
        {
            const value = row[c.Field];
            if (value === null || value === undefined || c.Value === null) return false;
            return c.Op === QueryCompareOp.Neq ? value !== c.Value : value === c.Value;
        }));
        return rows.map((row) =>
        {
            const projected: { [field: string]: ExternalRecord[string] } = {};
            for (const field of request.Fields)
            {
                if (field in row) projected[field] = row[field] ?? null;
            }
            return projected;
        });
    }

    public async Apply(_batch: WriteBatch): Promise<WriteResult>
    {
        return { Applied: 0, Conflicts: [] };
    }
}

export class RecordingAdapterFactory implements IDataSourceAdapterFactory
{
    public readonly Adapter = new RecordingAdapter();

    public constructor(public readonly Kind: DataSourceKind)
    {
    }

    public async Open(_connection: ResolvedConnection): Promise<IDataSourceAdapter>
    {
        return this.Adapter;
    }
}
