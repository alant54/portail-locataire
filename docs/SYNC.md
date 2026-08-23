# Sync ERP → miroir local

Le portail ne lit jamais l'ERP en direct : il rejoue son contenu dans une base SQLite
locale. L'ERP est en lecture seule (POST/PUT/PATCH/DELETE répondent 405) et le client
n'expose que des GET — `src/erp/client.test.ts` vérifie que sa surface ne contient aucun
verbe d'écriture.

## Commandes

| Commande | Effet |
|---|---|
| `npm run sync:full` | Import complet des 15 collections miroir, dans l'ordre des FK, puis amorce du curseur |
| `npm run sync` | Sync incrémentale : rejoue `sync-events` depuis le curseur |
| `npm run sync:full -- --only rental-units,leases` | Réimporte seulement ces collections (le curseur n'est alors pas déplacé) |
| `npm run sync:full -- --max-rows 2000` | Surcharge `SYNC_MAX_ROWS_PER_COLLECTION` |
| `npm run sync:full -- --entries=all` | Écritures et loyers de **tous** les baux (~26 min) au lieu des seuls baux du portail |
| `bash scripts/check-idempotent.sh` | Deux imports complets + un rejeu, et compare les comptes |

Toutes acceptent `DATABASE_URL` pour viser une base jetable :
`DATABASE_URL=/tmp/x.db npm run sync:full`. `check-idempotent.sh` l'impose
(`SYNC_CHECK_DB`, défaut `/tmp/sync-check.db`) — il ne touche jamais `data/app.db`.

## Variables d'environnement

- `ERP_API`, `ERP_PUBLISHABLE_KEY` — envoyées à la fois en `apikey` et en
  `Authorization: Bearer`. Seul le worktree lane A possède `.env.local`.
- `SYNC_MAX_ROWS_PER_COLLECTION` — plafond par collection, vide = aucun plafond.
  Valeur conseillée pour la démo : `2000`.

Le plafond ne s'applique qu'aux collections que la démo ne lit pas ligne à ligne, en
pratique **`meter-readings`** (90 000 lignes, aucun écran ne les affiche).
`tenant-account-entries` en est exclu volontairement bien qu'elle soit plus grosse
(161 603 lignes) : un solde est la somme de **toutes** les écritures, donc un import
tronqué afficherait un montant faux.

## Import complet

### La pagination par `offset` est cassée sur deux collections

Mesuré le 2026-08-23. Un parcours complet de `tenant-account-entries` en
`limit=1000&offset=…` ramène 161 603 lignes pour seulement **133 455 identifiants
distincts**, et deux parcours ne renvoient pas le même ensemble : l'ordre du serveur
comporte des ex æquo, donc ses fenêtres se recouvrent et en sautent d'autres. Une page
prise isolément est stable et reproductible ; c'est leur enchaînement qui ne l'est pas.

Conséquence concrète : un solde calculé sur cet import est faux. BAIL-000170 donnait
3 750 CHF contre 2 540 CHF selon `tenant-portal-snapshots`. `rent-terms` présente le même
défaut en miniature (4 725 lignes ramenées, 4 724 distinctes).

Le filtre `?lease_contract_id=` n'a pas ce problème : chaque bail tient dans une page
(≤ 35 écritures), la réponse est stable, et les soldes des quatre locataires de fixtures
retombent alors **exactement** sur l'oracle. Ces deux collections sont donc importées bail
par bail, jamais par `offset` — voir `PARTITIONED_BY_LEASE` dans `src/sync/full-import.ts`.

Aucun ordre de tri n'est proposé par l'API (`order`, `sort`, `order_by` sont ignorés), et
la concurrence n'aide pas : à 8 puis 16 requêtes parallèles l'ERP sérialise et le total
augmente (26 min → 31 min).

### Portée des écritures : `--entries`

| Portée | Baux parcourus | Durée | Usage |
|---|---|---|---|
| `demo` (défaut) | ceux d'un locataire du portail : table `users` ∪ `fixtures/meta.json` | ~18 s au total | démo et développement |
| `all` | les 6 525 baux du jeu de données | ~26 min | miroir complet |

Les 13 autres collections sont paginées normalement : leur parcours a été vérifié sans
perte (lignes ramenées = identifiants distincts) collection par collection.

Ordre d'import = rangs de `src/sync/registry.ts` : patrimoine → parties et baux → rôles
et objets → loyers, écritures, plans de paiement, compteurs, entretien. Chaque page est
écrite dans sa propre transaction via `src/db/upsert.ts` : conflit sur la clé primaire de
l'ERP, et une ligne portant un `source_revision` plus ancien est ignorée. Relancer
l'import ne duplique donc rien.

Mesure du 2026-08-23, avec `SYNC_MAX_ROWS_PER_COLLECTION=2000` et la portée `demo` :
**47 803 lignes en 18 s**. En `--entries=all`, compter ~26 min de plus pour les 6 525
requêtes par bail.

L'import **amorce le curseur** : `max(change_id)` est lu *avant* la première collection,
puis écrit dans `sync_cursor` à la fin. Sans cette étape le curseur resterait à 0 et le
premier `npm run sync` rejouerait les 20 665 événements — 7 à 10 minutes pour un
résultat nul. Lire le maximum d'abord garantit qu'un événement survenu pendant l'import
sera rejoué, jamais sauté. Un import partiel (`--only`) ne déplace pas le curseur.

## Sync incrémentale

Pagination par `after=<curseur>&limit=500`, **jamais `after` combiné à `offset`** : le
curseur avance après chaque lot committé et la requête suivante repart de lui. Un lot =
une page d'événements = une transaction SQLite, écriture du curseur comprise. Si un
appel échoue en cours de lot, rien n'est écrit et le curseur reste où il était.

### Résoudre un `upsert` (question A1 du PLAN)

`sync-events.entity_id` est un UUID, alors que les endpoints de détail n'acceptent qu'un
`external_ref`. La résolution passe donc par le miroir local, avec un choix guidé par le
coût :

```
lot de N événements pour une collection
  refetch détail : N requêtes
  re-pagination  : ceil(lignes / 1000) requêtes   (parties → 8)
  bascule        : N > lignes / 1000
```

En dessous de la bascule, chaque événement est résolu par
`GET /v1/{collection}/{external_ref}`. Au-dessus — ou si l'UUID est absent du miroir,
c'est-à-dire une ligne créée après notre import — la collection entière est re-paginée
une fois. Pour un lot plein de 500 événements cela fait 8 requêtes au lieu de 500.

### Suppressions

Un événement `delete` pose notre propre `deleted_at` ; l'ERP ne reçoit aucune écriture et
la ligne reste en base. L'`archived_at` de l'ERP ne peut pas porter l'information : 8 des
15 tables miroir n'ont pas cette colonne. Les lectures locataire filtrent donc
`archived_at IS NULL AND deleted_at IS NULL`.

## Trois limites à ne pas survendre en démo

1. **Le jeu de données ne contient aucun événement `delete`** — `?operation=delete`
   renvoie une page vide sur les 20 665 événements. Le chemin de suppression est couvert
   par le faux ERP de `src/sync/incremental.test.ts`, jamais par une démo live.
2. **En portée `demo`, le miroir ne contient les écritures que des baux du portail.**
   Les soldes affichés sont exacts pour tout locataire qui peut se connecter, mais un
   total « toutes agences » calculé sur cette base serait partiel. `--entries=all` lève la
   limite, au prix de 26 minutes.
3. **Seules 4 des 15 collections miroir apparaissent dans `sync-events`** :
   `party` (7 200), `rental_unit` (6 800), `lease_contract` (6 525), `property` (140) —
   un événement par ligne existante. Les 11 autres (loyers, écritures de compte,
   compteurs, entretien…) ne se rafraîchissent que par `sync:full`. C'est le comportement
   de l'ERP, pas une lacune de la sync.

`lease_contract` mérite une mention : le type d'événement n'est **pas** le singulier du
nom de collection. Déduire les clés par singularisation donnerait `lease`, qui ne
correspond à rien, et perdrait 6 525 des 20 665 événements sans qu'aucune table paraisse
mal mappée. `ENTITY_TYPE_TO_RESOURCE` est donc une liste blanche mesurée, verrouillée par
`src/sync/registry.test.ts`. Tout autre `entity_type` est compté et ignoré, jamais fatal.

## Suivi des exécutions

Chaque run écrit une ligne dans `sync_runs` (`kind`, `started_at`, `finished_at`,
`events_applied`, `cursor_before`, `cursor_after`, `status`, `error`).

L'écran de gestion (lane C) appelle :

```ts
import { runIncrementalSync, listRecentSyncRuns } from "@/sync";

const summary = await runIncrementalSync();   // SyncRunSummary, contrat gelé
const history = listRecentSyncRuns(10);
```

`runIncrementalSync()` s'appelle sans argument. Ses deux paramètres optionnels
(`database`, `client`) n'existent que pour les tests : ils élargissent le contrat, ils ne
le rétrécissent pas. Pour un import complet, `SyncRunSummary.kind` vaut `"full"` et
`eventsApplied` compte les lignes écrites plutôt que les événements.
