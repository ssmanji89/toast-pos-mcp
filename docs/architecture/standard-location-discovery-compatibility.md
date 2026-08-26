# Standard API location-discovery compatibility

**Status:** implementation-safe; live Standard-credential compatibility unproven
**Last reviewed:** 2026-08-16
**Release gate:** GitHub issue #28
**Current security model:** [`threat-model-t2-location-repair.md`](threat-model-t2-location-repair.md)

## Decision

The reporting runtime needs an authoritative set of restaurant locations for the current credential before it can expose location-aware capabilities or reports. Group membership is not sufficient: Toast Standard API credentials can be configured for only selected restaurants inside one management group.

The current implementation therefore uses a two-stage source model:

1. a credential-scoped `GET /partners/v1/restaurants` request, with no fabricated `Toast-Restaurant-External-ID` header, to obtain the active connection GUIDs and per-connection scope strings;
2. a restaurant-scoped `GET /restaurants/v1/restaurants/{restaurantGUID}?includeArchived=false` for each active connection to hydrate the report context.

The runtime **does not** fall back to every restaurant in the management group if the credential-wide source is unavailable. That would convert group membership into an authorization claim that Toast Standard credentials do not guarantee.

## Why live verification is still required

Toast's current public documentation is internally inconsistent about Standard API access to the Partners location endpoint.

The following official sources say or imply that Standard API credentials can use it:

- [Standard API access credentials](https://doc.toasttab.com/doc/devguide/devApiAccessCredentials.html) says restaurant GUIDs for Standard credentials can be retrieved using the Partners API.
- [API overview](https://doc.toasttab.com/doc/devguide/apiOverview.html) lists Partners `GET` under Standard API access.

But Toast's dedicated [Location access](https://doc.toasttab.com/doc/devguide/apiPartnersGettingAccessibleRestaurants.html) guide says `/partners/v1/restaurants` and `/partners/v1/connectedRestaurants` are only usable by partner API accounts and that restaurant-management-group clients must use the Restaurants API instead. Standard API resources also direct Standard users to restaurant-management-group authentication documentation.

Synthetic fixtures cannot resolve an authorization contradiction in the vendor's own production documentation. The source must therefore be probed with an owner-authorized Standard API credential before the package can claim Standard production compatibility.

## Fail-closed runtime behavior

Until issue #28 is satisfied:

- the credential-scoped Partners request remains a hard-coded allowlist, not a generic headerless Toast request primitive;
- an HTTP 403 from that source becomes `ToastLocationError` code `location_discovery_source_unavailable` with a static message;
- the upstream response body, request ID, caught error, credentials, and bearer token are not retained on that location error;
- no group-wide or inferred-location fallback is attempted;
- no partial location registry is published.

This makes an unsupported credential type explicit without inventing a false location set.

## Release proof required by issue #28

T6-003 must not publish or claim Standard API production compatibility until a sanitized read-only probe shows what a real Standard credential does.

The proof must cover:

1. a Standard credential created through Toast Web;
2. `GET /partners/v1/restaurants` with Authorization only;
3. whether the returned GUID set exactly matches the credential's configured location set;
4. whether per-connection `scopes` are present and usable;
5. restaurant-detail hydration for at least one authorized GUID;
6. when available, a Standard credential configured for a proper subset of a multi-location management group.

No credential, token, guest-linked data, or Merchant Data payload is to be committed as evidence.

If the Partners source is unavailable for Standard credentials, #28 requires a separately reviewed compatibility slice for an explicit authorized-location source. Candidate designs must preserve the configured subset. The implementation must not infer access from management-group membership or from a generic 403.

## Downstream consequence

T2-002 capability preflight may consume `ToastLocation.connectionScopes` only after the location source itself is available. The final eligible scope set is the intersection of:

- current token provisioned scopes; and
- the selected restaurant connection's scopes;

followed by product-policy exclusions.

A missing or unavailable location source is a capability/context denial, never a successful empty report.

## Source ownership

- Runtime implementation: `src/locations.ts`, `src/transport.ts`
- Production-shaped synthetic proof: `test/locations.test.ts`, `test/location-guard-matrix.test.ts`, `test/partners-transport.test.ts`
- Current security model for this repaired boundary: [`threat-model-t2-location-repair.md`](threat-model-t2-location-repair.md)
- Historical/general threat model: [`threat-model.md`](threat-model.md); its old T2-001 aggregate-source statements are superseded by the addendum above
- Broader source map: `docs/research/toast-api-reporting-landscape.md`
- Live compatibility gate: issue #28

DOX: this document records a durable production-compatibility assumption and its explicit release proof rather than pretending the assumption is settled.
