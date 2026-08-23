# Portail locataire — FD_CHALLENGE

Tenant portal over a **read-only** property-management ERP (fictive data, CHF, Vaud).
Everything the portal owns lives in a local SQLite database; the ERP is only ever read.

## Démarrage

```bash
npm install
npm run setup      # migrations + fixtures + comptes de démonstration
npm run dev        # http://localhost:5173
```

`setup`, `dev` and `test` work from a bare clone with **no `.env.local`** — the fixture
snapshot in `fixtures/` stands in for the ERP. Only `npm run pull:fixtures` and the sync
need ERP keys.

## Comptes de démonstration

Mot de passe pour tous les comptes : **`portail2026`**

| Compte | Rôle | Ce qu'il démontre |
|---|---|---|
| `lea.martin@example.ch` | locataire `TEN-00005` | bail BAIL-000005, Ecublens VD — le tableau de bord complet |
| `lucas.martin@example.ch` | co-titulaire `TEN-06002` | **le même bail que Léa**, résolu via `lease_parties` — et rien d'autre |
| `adrien.clerc@example.ch` | locataire `TEN-00170` | l'autre côté du test d'isolation |
| `gerance@example.ch` | gérance | les écrans de gestion (404 pour un locataire) |

Les comptes sont recréés par `npm run seed:demo`, qui fait partie de `npm run setup`.

## Isolation des données (point 3 de la checklist)

Toute lecture locataire passe par `src/db/tenant-queries.ts`, dont chaque fonction prend
`tenantRef` **issu de la session** — jamais d'une URL, d'un formulaire ou d'un en-tête.
Une référence venue de l'URL (`/bail/<ref>`) ne sert qu'à *restreindre* à l'intérieur des
baux du locataire : une référence étrangère donne `null`, donc 404.

La preuve automatisée est `src/auth/isolation.test.ts` : deux locataires se connectent
réellement, puis chacun demande le bail de l'autre sur les vrais modules de route.

```bash
npm test                                  # toute la suite
npx vitest run src/auth/isolation.test.ts # uniquement l'isolation
```

## Commandes

| Commande | Description |
|---|---|
| `npm run setup` | migrations + fixtures + comptes de démo |
| `npm run dev` | Next.js sur le port 5173 |
| `npm test` | vitest (chaque suite a sa propre base) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run sync` / `sync:full` | synchronisation ERP incrémentale / import complet |

Détails d'architecture et décisions : `CLAUDE.md`, `docs/PLAN.md`, `openspec/changes/`.
