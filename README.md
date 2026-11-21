> **Archived (2026-11-21).** This package moved into [pragmatic-env-server](https://github.com/pragmatic-tech-ai/pragmatic-env-server) as the workspace package `packages/pragmatic-identity-engine-binding`, its only consumer; it is no longer published here.

# @pragmatic-tech-ai/pragmatic-identity-engine-binding

The bridge engine that binds the TODL security model to the
`@pragmatic-tech-ai/pragmatic-identity` authorization model. It depends on the core
packages (`todl`, `pragmatic-identity`) and `pragmatic-graph`, so that neither core package has to
depend on the other.

Formerly published as `@pragmatic-tech-ai/todl-identity-engine` (0.1.0); that name is retired. GitHub Packages does
not support `npm deprecate`, so the old version carries no deprecation flag.

Surface:

- `SecurityVocabulary`: exhaustive value maps from TODL's `SecurityAction` /
  `SecurityDepth` to identity's `PrivilegeAction` / `AccessLevel`; an unmapped
  value throws.
- Tier-1 security evaluation over the environment's package security (S1
  `IEnvironmentSecurity`) and its C5 setting: `RealmSecurityModel`,
  `MembershipResolver`, `EffectiveRoleTable`, `AccessDepthEvaluator` and
  `FieldSecurityEvaluator`; dropped setting entries surface as `Tier1Diagnostic`.
- `Tier1ScopeCompiler` (contract C6): one principal's package security and
  environment setting as one `@pragmatic-tech-ai/pragmatic-graph` `AccessScope`, over the
  fixed system fields (`owner`, `owningBusinessUnit`) and share grants only.
  `Compile` is the runtime scope; `CompileAssign` the scope ownership assignment
  runs under (Update gated by the assign depth, system fields writable);
  `Grants` exposes the per-action levels and unguarded depth predicates for the
  checks a scope cannot express (share, invoke); `Diagnose` lists dropped setting
  entries. Depth is judged per role source: a directly assigned role against the
  principal's home unit, a team's role against the team's unit. Concepts bound
  to external connectors (`Tier1Catalog.EngineStoredConcepts`) get no entries;
  edge concepts are governed by their endpoints (`Endpoints`); platform
  vocabulary is readable by all and writable by none. Requires the engine's
  Append/AppendTo rules and `Endpoints` scope option (pragmatic-graph 0.4.0).

Business-unit hierarchy lives in `@pragmatic-tech-ai/pragmatic-identity`. Packages are
consumed from their root barrels and via compiled `dist` output.
