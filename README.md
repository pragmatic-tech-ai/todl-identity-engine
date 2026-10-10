# @pragmatic-tech-ai/todl-identity-engine

The bridge engine that binds the TODL compiler's declarative `policy` nodes and
runtime enforcement seams to the `@pragmatic-tech-ai/todl-identity` authorization
model. It depends on **both** core packages (`todl` and `todl-identity`) so that
neither core package has to depend on the other.

Responsibilities:

- Read `<concept>@policy` nodes from a built TODL `Repository`.
- Compile a `PolicyPredicate` (plus a `Principal`) into an evaluable
  `EntityPredicate`, with deny-overrides semantics across a concept's rules.
- Provide a fusion `IAccessPolicy` that delegates resource-level decisions to
  `ResourceAuthorizationPolicy` (RBAC) while supplying compiled per-concept
  entity filters.
- Adapt compiled predicates into TODL's `IInstanceFilter` (authoritative
  in-memory read enforcement) and `IConnectorQueryFilterProvider` (sound
  query push-down for the eligible predicate subset).

Both core packages are consumed from their **root barrels** only (TODL permits
no deep-subpath imports) and via their compiled `dist` output.
