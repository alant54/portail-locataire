# Tester le portail — protocole d'évaluation

Ce document est la contre-épreuve du brief : chaque section correspond à un point de
« **En démo — ce qu'on regarde** » et de la checklist « **Avant de rendre** ».
Tout ce qui est écrit ici a été exécuté une fois tel quel ; les résultats attendus sont
ceux réellement observés, pas ceux espérés.

---

## 1. Démarrage et comptes de démo — *checklist « de quoi lancer le projet »*

```bash
cd /home/vscode/wt-c
npm install                   # déjà fait dans ce worktree
npm run setup                 # migrations + fixtures + comptes de démo  (déjà fait)
npm run dev -- -p 5175
```

`npm run setup` est idempotent : le relancer ne duplique ni les lignes miroir ni les
comptes. Il affiche les quatre comptes à la fin.

Mot de passe unique : **`portail2026`**

| Compte | Rôle | Pourquoi il existe |
|---|---|---|
| `lea.martin@example.ch` | locataire `TEN-00005` | le parcours principal (bail BAIL-000005, Ecublens VD) |
| `lucas.martin@example.ch` | co-titulaire `TEN-06002` | **même bail que Léa**, résolu par `lease_parties` — prouve qu'un co-titulaire n'est pas un cas oublié |
| `adrien.clerc@example.ch` | locataire `TEN-00170` | l'autre côté du test d'isolation |
| `gerance@example.ch` | gérance | les écrans de gestion |

Ouvrez chaque locataire dans une **fenêtre privée distincte** : les trois sessions
cohabitent, ce qui rend le § 4 beaucoup plus rapide.

---

## 2. Point 1 du brief — « comprendre sa situation en dix secondes »

1. `http://localhost:5175/` → vous êtes redirigé vers `/login`.
2. Connectez-vous avec `lea.martin@example.ch` / `portail2026`.
3. Vous atterrissez sur **Mon logement**.

Chronométrez-vous. En une page, sans scroller au-delà du premier écran, vous devez lire :

- **Logement** — Appartement 00005, Route des Vignes 5, 1024 Ecublens VD, 4 pièces, 77 m², étage 4
- **Bail** — 1 090.00 CHF / mois, BAIL-000005, actif, début 06.04.2023, détail 980 + 110 de charges
- **Solde** — `1 090.00 CHF à payer`, « 1 écriture en retard », puis les 5 dernières écritures
- **À venir** — prochain entretien 20.02.2027, parties communes
- un renvoi vers **Mes demandes**

Deux vérifications de fond :

- **Le solde est juste.** Il vaut Σ débits − Σ crédits sur *toutes* les écritures du bail,
  pas seulement celles affichées. L'oracle est `fixtures/tenant-portal-snapshots.json` :
  `npx vitest run src/db/fixtures.test.ts` compare les deux pour les quatre locataires de
  fixtures.
- **Le co-titulaire.** Connectez-vous en `lucas.martin@example.ch` : il voit **le même
  bail** que Léa. Un portail qui résoudrait « mon bail » via `leases.primary_rental_unit_id`
  lui afficherait une page vide — c'est le piège du jeu de données.

Cliquez **Voir le bail en détail →** : `/bail/BAIL-000005` liste toutes les écritures.

---

## 3. Point 2 du brief — « une action réelle, pas un bouton mort »

Le tour complet à faire, dans l'ordre — il traverse les deux côtés du produit :

1. **Locataire (Léa)** → *Mes demandes* → **Nouvelle demande**.
   Le formulaire affiche « La demande est enregistrée pour votre logement (APT-00005, bail
   BAIL-000005). Ces références proviennent de votre session. »
2. Choisissez une catégorie, un objet, une description → **Envoyer la demande**.
   Vous êtes redirigé vers le détail de la demande, statut **ouverte**, avec sa chronologie.
   *Envoyer un formulaire vide doit afficher des messages de validation et n'écrire aucune ligne.*
3. Ajoutez un **commentaire** en tant que locataire : il apparaît dans la chronologie.
4. **Gérance** (autre fenêtre, `gerance@example.ch`) → `/admin/requests` : la demande est
   dans la boîte de réception, avec le `tenant_ref` et le `lease_ref`.
5. Ouvrez-la, **changez le statut** (ex. *en cours*) et écrivez un commentaire gérance.
6. **Retour côté locataire**, rechargez le détail : le nouveau statut et le message de la
   gérance sont là, et le changement de statut est lui-même une entrée de la chronologie.

Preuve que ça écrit vraiment dans *votre* base, pas dans l'ERP :

```bash
cd /home/vscode/wt-c
sqlite3 data/app.db "select id, tenant_ref, lease_ref, unit_ref, status, category, title from tickets;"
sqlite3 data/app.db "select kind, author_kind, substr(body,1,40) from ticket_comments;"
```

Les colonnes sont des **références** (`TEN-…`, `BAIL-…`, `APT-…`), jamais des UUID : une
demande survit à un `sync:full` qui réécrirait tout le miroir.

---

## 4. Point 3 du brief — « un locataire ne voit pas les données d'un autre. On essaiera. »

C'est le point où le brief annonce explicitement une attaque. Voici les six essais, avec
le résultat attendu. Les essais 1, 2, 3 et 5 ont été rejoués en HTTP et donnent bien ce
qui est écrit ; l'essai 4 a été vérifié avec un id inexistant (le cas « demande d'un autre
locataire » est couvert par la suite de tests), et l'essai 6 uniquement par la suite.

| # | Essai | Attendu |
|---|---|---|
| 1 | Anonyme sur `/`, `/bail`, `/tickets`, `/tickets/new` | **307** vers `/login` |
| 2 | Cookie de session bidon (`portal_session=deadbeef`) sur `/` | **307** vers `/login` (session inconnue ≠ session valide) |
| 3 | Léa demande le bail d'Adrien : `/bail/BAIL-000170` | **404** |
| 4 | Léa demande une demande qui n'est pas la sienne : `/tickets/<id d'Adrien>` | **404** — indiscernable d'un id inexistant |
| 5 | Un locataire connecté sur `/admin`, `/admin/logins`, `/admin/requests`, `/admin/sync` | **404**, pas une redirection : un locataire n'apprend pas que `/admin` existe |
| 6 | Champ caché forgé dans le formulaire de demande (`tenant_ref=TEN-00170`) | ignoré ; la ligne écrite porte les refs de la **session** |

Pour l'essai 4, le plus simple : créez une demande avec Adrien, relevez son id dans
`/admin/requests` en tant que gérance, puis ouvrez `/tickets/<cet id>` dans la fenêtre de
Léa.

Pour l'essai 6, ajoutez le champ avec les devtools (`Inspecter` → ajouter
`<input type="hidden" name="tenant_ref" value="TEN-00170">` dans le formulaire) puis
envoyez, et regardez la ligne écrite en base. La version automatisée du même essai est
`src/app/(tenant)/tickets/actions.test.ts`.

Version scriptée de la matrice, si vous préférez une preuve en une commande — récupérez
`portal_session` dans les devtools (Application → Cookies) et :

```bash
LEA=<valeur du cookie de Léa>
for p in / /bail/BAIL-000005 /bail/BAIL-000170 /admin /admin/sync; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: portal_session=$LEA" http://localhost:5175$p)"
done
# / 200 · /bail/BAIL-000005 200 · /bail/BAIL-000170 404 · /admin 404 · /admin/sync 404
```

Le mécanisme derrière : toute lecture locataire passe par `src/db/tenant-queries.ts` et
`src/tickets/service.ts`, dont chaque fonction reçoit le `tenantRef` **de la session**.
Une référence venue de l'URL ne sert qu'à *restreindre* à l'intérieur du périmètre déjà
filtré. La preuve automatisée est `src/auth/isolation.test.ts` : deux locataires se
connectent réellement, puis chacun demande le bail de l'autre sur les vrais modules de route.

```bash
npx vitest run src/auth/isolation.test.ts
```

---

## 5. Point 4 du brief — « la synchro peut être relancée sans dupliquer les données »

Deux niveaux, selon que vous avez les clés ERP ou non.

### Sans clé ERP (ce que fera un évaluateur qui clone le dépôt)

L'idempotence est testée contre un faux ERP, donc hors ligne :

```bash
npx vitest run src/db/upsert.test.ts src/sync/incremental.test.ts src/sync/full-import.test.ts
```

Ce qui est couvert : deux écritures de la même ligne ERP laissent une ligne ; un
`source_revision` plus ancien n'écrase pas ; une table de liaison sans `id` s'upsert sur sa
clé composite ; un `delete` est appliqué **localement** sans jamais écrire dans l'ERP ; un
`entity_type` inconnu est ignoré au lieu d'être fatal ; le curseur avance batch par batch.

### Avec les clés ERP (le vrai aller-retour)

`.env.local` n'existe que dans `/workspace` et `/home/vscode/wt-a`. Pour tester la synchro
depuis `wt-c` :

```bash
cp /workspace/.env.local /home/vscode/wt-c/.env.local
cd /home/vscode/wt-c
bash scripts/check-idempotent.sh          # base jetable /tmp/sync-check.db, jamais data/app.db
```

Le script fait exactement ce que le brief demande de vérifier : deux `sync:full`
consécutifs puis comparaison ligne à ligne des comptes de chaque table, puis un
rembobinage du curseur et un rejeu des événements, avec re-comparaison. Il sort en erreur
si un compte bouge. Comptez plusieurs minutes (l'ERP sert ~330 k lignes).

Côté interface : `/admin/sync` en tant que gérance affiche le curseur, le nombre de lignes
miroir et les dernières exécutions (`cursor_before → cursor_after`). Le bouton **Relancer
la synchro** appelle la sync incrémentale et ajoute une ligne au tableau. Les comptes ne
doivent pas bouger. **Sans `.env.local`, le bouton enregistre une exécution en échec avec
son message d'erreur** — c'est le comportement voulu, pas un plantage.

---

## 6. Point « deux ou trois écrans côté gérance »

Connecté en `gerance@example.ch`, vous arrivez directement sur `/admin` (un manager n'a pas
de tableau de bord locataire : `/` le redirige vers `/admin`).

| Écran | À vérifier |
|---|---|
| `/admin/logins` | vos connexions du jour en tête ; faites exprès une **tentative ratée** (mauvais mot de passe) et rechargez : elle apparaît avec son `outcome`, y compris pour une adresse inconnue |
| `/admin/requests` | la demande créée au § 3 ; filtre par statut ; changement de statut et commentaire gérance |
| `/admin/sync` | curseur, lignes miroir, 10 dernières exécutions, bouton de relance (§ 5) |

---

## 7. « Le code doit se lancer chez nous » — l'essai depuis un clone nu

C'est le seul test qui vérifie la promesse telle que l'évaluateur la vivra. À faire depuis
la branche qui sera livrée (donc **après** le merge de `lane-c`) :

```bash
git clone /workspace /tmp/portail-check
cd /tmp/portail-check
git checkout lane-c        # ou main, une fois le merge fait
npm install                # better-sqlite3 compile ; build-essential est requis
npm run setup
npm run dev -- -p 5180
```

Aucun `.env.local` n'est copié : `setup`, `dev` et `test` doivent fonctionner sans clé,
sur le snapshot `fixtures/`. Reprenez ensuite les § 2 et 3 dans ce clone.

---

## 8. La suite automatisée

```bash
cd /home/vscode/wt-c
npm test          # 18 fichiers, 134 tests
npm run typecheck # tsc --noEmit, silencieux = bon
```

Résultat obtenu : **134/134 tests au vert, typecheck propre**. Aucune suite ne touche
`data/app.db` — chacune ouvre sa propre base migrée (`src/db/test-db.ts`).

---

## 9. Ce qui n'est pas là (à savoir avant de chercher)

Ce ne sont pas des bugs à trouver, ce sont des coupes ou des étapes non encore faites :

- **`lane-c` n'est pas mergée dans `main`.** À faire avant toute livraison, sinon
  l'évaluateur clone une version où `/tickets` et `/admin` sont des placeholders.
- **Le rapport n'existe pas** (point 6 de la checklist : « ce que tu n'as pas fait, et
  pourquoi »). La matière est dans `docs/PLAN.md` § coupes, `docs/SYNC.md` et les
  `openspec/changes/*/design.md`, mais rien n'est encore rédigé pour le rendu.
- **Le README ne parle pas encore des demandes ni des écrans gérance** — il s'arrête à
  lane B.
- **L'assistant Gemini (bonus) n'est pas construit.** `GEMINI_API_KEY` est dans
  `.env.example`, aucun code ne l'utilise.
- **`meter-readings` est plafonné** à la synchro (`SYNC_MAX_ROWS_PER_COLLECTION`) : 90 000
  lignes qu'aucun écran n'affiche. `tenant-account-entries` ne l'est volontairement pas —
  le solde a besoin de toutes les écritures.
- **Le jeu de données ne contient aucun événement `delete`** : le chemin de suppression
  douce n'est démontrable que contre le faux ERP des tests.
- **La pagination `offset` de l'ERP est cassée** sur `tenant-account-entries` et
  `rent-terms` ; ces deux collections sont importées bail par bail. Détail et mesures dans
  `docs/SYNC.md` — c'est un bon sujet pour le rapport.
