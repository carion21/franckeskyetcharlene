# Franckesky & Charlène — Mariage 10/10/2026

> Landing mariage à 3 variantes (`/v1` `/v2` `/v3`) + RSVP → QR → PDF → MinIO → `.ics`.
> Voir [`PRD.md`](../PRD.md) et [`PLAN.md`](../PLAN.md) à la racine du workspace.

## Phase 0 — Lecture des designs (FC-001)

### Correspondance wireframe → version

| Wireframe (ordre de découverte dans `designs/Trois structures de scroll en wireframe/`) | Version |
|---|---|
| `Mariage FC - 1a Pellicule.dc.html` | `/v1` |
| `Mariage FC - 1b Quatre Actes.dc.html` | `/v2` |
| `Mariage FC - 1c Fil Doré.dc.html` | `/v3` |

### Résumé de lecture — Template A5 (`designs/Template invitation mariage A5/`)

Carte d'invitation individuelle, rendu serveur (Puppeteer/wkhtmltopdf), HTML/CSS pur sans JS ni appel réseau à l'exécution.

- **`invitation-mariage.html`** — portrait A5 (148×210mm), page unique.
- **`invitation-mariage-paysage.html`** — A4 paysage recto-verso (2 panneaux A5 : verso monogramme "F&C" + remerciement, recto = carte identique au portrait), pliage central.
- **`preview/`** — rendus HTML de contrôle + `sample-qr-placeholder.png`.

Confirmé contre PRD §2.1/§2.2 :
- Palette exacte : fond `#046241` (vert émeraude), accent `#C9A227` (or), texte `#FDFBF6` (blanc crème).
- Typographies exactes : **Great Vibes** (prénoms/titres script), **Cormorant Garamond** (corps/verset), **Cormorant** SemiBold small-caps (labels/heures/dress code).
- Ornements Art Déco : double cadre (filet extérieur + filet intérieur translucide), arcs SVG haut/bas avec losange central, écoinçons (coins) avec volutes/feuilles — répétés à l'identique sur chaque panneau.
- Variables à injecter : `{{nom_invite}}`, `{{qr_code_data_uri}}` (data URI PNG base64, aucune URL externe), `{{date_mariage}}`.
- Contenu fixe conforme au PRD : verset Ecclésiaste 4:12, programme (10h civile Mairie de Yopougon / 13h30 religieuse Église CMA Port-Bouët 2 / 16h réception Espace Royal KS), dress code "Chic & Élégant · Vert Émeraude, Or & Blanc", contact 0709898475.
- Polices en `@font-face` avec fallback web-safe (Georgia/cursive) — deux options prévues pour le rendu headless (fichiers `.woff2` locaux ou Google Fonts en ligne).

**Esprit à conserver pour le PDF final** : composition centrée, hiérarchie eyebrow → verset → prénoms en script doré → date → programme → dress code → bloc invité nominatif → QR encadré → contact. Rien à retravailler ici : le PRD ne prévoit pas de refonte de la carte, seulement une exécution soignée du template fourni (§0 du PRD).

### Résumé de lecture — 3 wireframes de scroll (`designs/Trois structures de scroll en wireframe/`)

Structure commune aux 3 : overlay d'ouverture (monogramme "F&C" tracé au trait) → hero plein écran (photo + gradient vert + prénoms en Great Vibes + compte à rebours) → contenu → formulaire RSVP inline → contact WhatsApp → footer. Toutes s'appuient sur `support.js` (moteur `x-dc`/React-like), `image-slot.js` (placeholder photo) et `wedding-data.js` (countdown, validation email, soumission RSVP).

- **v1 — Pellicule** (`1a`) : scroll continu façon bande-film, sections empilées sans rupture visuelle forte (bienvenue → verset encadré → programme en timeline verticale à icônes → dress code avec pastilles couleur → CTA RSVP → formulaire → contact → footer). Pas de découpage en "actes" explicite, transitions fondu/translation homogènes via `IntersectionObserver`.
- **v2 — Quatre Actes** (`1b`) : même contenu mais structuré explicitement en actes (`data-screen-label="ACTE I/II/III/IV"` + `CLÔTURE`) — Acte I hero, Acte II bienvenue+verset, Acte III programme+dress code, Acte IV climax+RSVP. Rythme plus séquencé, sections resserrées (formulaire fusionné avec le bloc climax).
- **v3 — Fil Doré** (`1c`) : variante "timeline" avec une ligne verticale dorée (`data-spine-fill`) qui se remplit au scroll (progress bar), contenu alterné gauche/droite le long du fil avec pastilles sur la ligne. Effet le plus narratif/vertical des trois, hero plus court (sans les feuilles flottantes `motionEnabled`).

**Esprit à conserver** : chorégraphie de reveal au scroll (`IntersectionObserver`, fade+translateY), compte à rebours live, formulaire RSVP inline avec pills de sélection, palette/typo identiques au template A5, CTA WhatsApp fixe en bas de parcours, monogramme "F&C" en ouverture/fermeture.

**Ce qui sera retravaillé** (le PRD prévaut sur le wireframe — voir §0 et §4.1 du PRD) :
- Les 3 wireframes sont des esquisses de **structure/ordre**, pas des maquettes à recopier au pixel près — la chorégraphie scroll détaillée du §4.1 du PRD et les principes UX/neuro-UX du PRD priment sur le rendu brut ici.
- Le moteur `x-dc`/`support.js` est propre à l'outil de wireframing ; l'implémentation réelle sera en EJS + JS vanilla (stack imposée §5 du PRD), pas de dépendance à ce runtime.
- `rsvpEndpoint` pointe vers un placeholder (`URL_A_DEFINIR`) — à câbler sur `POST /api/rsvp` réel (§9 du PRD), avec dédoublonnage serveur (pas seulement client).
- Les données d'invité par défaut ("Oui/Non" accompagné, etc.) et la validation à reprendre selon le modèle Prisma du §7 du PRD, pas selon `wedding-data.js`.

---

## Lancement local

```bash
npm install
cp .env.example .env         # puis remplir les valeurs
npx prisma migrate deploy    # applique les migrations existantes
npx prisma generate
npm run seed:admin           # crée le compte admin depuis ADMIN_USERNAME/ADMIN_PASSWORD
npm start                    # http://localhost:3000
                             # landings /v1 /v2 /v3 · backoffice /admin
```

`PORT` est lu depuis `.env` (défaut 3000).

### Migrations Prisma

```bash
npx prisma migrate dev --name <nom>   # dév : crée + applique une migration
npx prisma migrate deploy             # prod : applique les migrations déjà créées
npx prisma studio                     # inspection des données
```

Migration initiale : `prisma/migrations/20260916182434_init` — tables `Rsvp` et `AdminUser`
(PRD §7), `utf8mb4_unicode_ci`, index uniques sur `Rsvp.email` et `AdminUser.username`.

### Compte admin

`npm run seed:admin` lit `ADMIN_USERNAME` / `ADMIN_PASSWORD` dans `.env`, hashe le mot de passe
en bcrypt (cost 12) et n'écrit **que le hash** en base — le mot de passe en clair n'est jamais
stocké ni loggé (PRD §6). Le script est idempotent : un second run met à jour le hash du même
`username` au lieu de dupliquer la ligne, ce qui en fait aussi la procédure de rotation du mot
de passe. Il refuse de tourner si les variables sont absentes ou si le mot de passe fait moins
de 12 caractères.

## Notes techniques — Phase 1

### Prisma 6 (et non 7)

Prisma 7 a été écarté volontairement : il génère un client ESM dans `generated/prisma`,
impose un fichier de config TypeScript (`prisma7.config.ts`) alors que le projet est en
JS/CommonJS sans chaîne TS, et installe des fichiers de "skills" tiers dans le repo.
Le projet utilise donc Prisma **6.19.3** avec le générateur classique `prisma-client-js` :
`require('@prisma/client')` fonctionne directement, `url = env("DATABASE_URL")` reste dans
`prisma/schema.prisma`, et la structure correspond au §8 du PRD.

### Sécurité des dépendances (`npm audit`)

`npm audit` remonte **4 vulnérabilités modérées**, toutes dans la chaîne transitive de `minio`
(`decode-uri-component`, `query-string`, `stream-json`) — des DoS sur parsing d'entrée malformée.

Elles sont **acceptées en connaissance de cause** :
- le seul correctif proposé par npm est un *downgrade* vers `minio@7.1.3` (breaking, plus ancien) ;
- les versions patchées de `decode-uri-component` et `stream-json` sont **ESM pur**, incompatibles
  avec `minio` qui est en CommonJS — un `overrides` casserait le runtime ;
- ces parsers traitent les réponses de notre propre endpoint MinIO, pas des entrées contrôlées
  par un attaquant.

À revoir dès qu'une version de `minio` corrige la chaîne en amont.

Les vulnérabilités **hautes** ont, elles, été corrigées via `overrides` dans `package.json` :
- `mysql2` → `^3.24.4` (fuite de credentials en clair via downgrade du plugin d'auth — critique
  ici puisque `DATABASE_URL` transite par ce driver) ;
- `deepmerge-ts` → `^8.0.2`.

## Notes techniques — Phase 3 (les 3 landings)

### Décision de factorisation `shared/` (FC-007)

Comparaison faite sur les 3 wireframes : lien Google Fonts **identique au octet près**,
même palette, même contact (`wa.me/2250709898475`), même footer. Seule la **structure de
scroll** diffère réellement. Factorisation retenue :

| Fichier | Contenu | Pourquoi partagé |
|---|---|---|
| `shared/palette.css` | Tokens couleur, rythme, reset, `prefers-reduced-motion` | Palette identique aux 3 (PRD §2.1) |
| `shared/fonts.css` | Great Vibes / Cormorant Garamond / Cormorant | Stack typo identique aux 3 (PRD §2.2) |
| `shared/rsvp.js` | Compte à rebours + soumission/validation RSVP | **Comportement** identique aux 3 |

`shared/rsvp.js` va au-delà de la lettre de FC-007 (qui ne citait que palette + polices).
Raison : le chemin RSVP est le cœur métier (PRD §4.2) et il est rigoureusement identique
sur les 3 versions — le tripler imposerait de corriger trois fois le même bug en Phase 4.
En revanche la **chorégraphie de scroll n'est pas factorisée** : chaque version garde son
`vN/animations.js`, conformément à « code segmenté, chaque version a sa propre structure »
(PRD §4.1). Aucune factorisation de mise en page, les 3 structures divergent trop.

### Les trois partis pris

| Version | Wireframe | Parti pris |
|---|---|---|
| `/v1` | 1a Pellicule | Flux **continu**, sections enchaînées comme des photogrammes, perforations latérales |
| `/v2` | 1b Quatre Actes | Lecture **ponctuée** : chaque acte annoncé par un chiffre romain filigrane + filet doré tiré |
| `/v3` | 1c Fil Doré | **Ligne unique** : un fil central se remplit au scroll, le récit s'y accroche en alternance |

Les 3 servent le même contenu fixe (PRD §2.3) et le même formulaire (champs alignés sur le
modèle `Rsvp` du PRD §7 : `prenom`, `nom`, `accompagne`, `relation`, `email`, `telephone` —
et non les champs du wireframe, moins précis).

### Deux garanties de robustesse (vérifiées, pas supposées)

1. **Rien n'est masqué par le CSS** — seul le JS masque, juste avant d'animer. Si le CDN
   GSAP est injoignable ou que le SRI échoue, la page reste intégralement lisible.
2. **`prefers-reduced-motion: reduce`** coupe la chorégraphie sans rien laisser masqué, et
   l'écran d'ouverture se retire via une animation CSS autonome — un échec JS ne peut pas
   le laisser bloqué par-dessus la page.

Les deux cas ont été testés sur les 3 versions (Puppeteer, CDN coupé et media feature
émulée) : aucun élément masqué, aucun overlay bloquant, compte à rebours toujours actif.

### Contraste : l'or pur ne sert pas de couleur de texte

L'or `#C9A227` du PRD §2.1 y est décrit comme **« accent décoratif »**, le texte sur fond
foncé étant le crème. Mesures WCAG :

| Combinaison | Ratio | Verdict |
|---|---|---|
| `#C9A227` sur `#046241` | 3.07:1 | ✗ insuffisant pour du texte |
| `#C9A227` sur `#FDFBF6` | 2.34:1 | ✗ nettement insuffisant |
| `#E4C766` sur `#046241` | 4.48:1 | ✓ AA |
| `#8A6F14` sur `#FDFBF6` | 4.65:1 | ✓ AA |

L'or pur reste donc réservé à l'**ornement** (filets, cadres, bordures, icônes, perles —
3:1 suffit pour un composant d'interface, seuil atteint) et deux teintes dérivées prennent
le relais pour le **texte de petite taille** : `--gold-on-emerald` et `--gold-on-cream`.
Visuellement l'or reste l'or ; les heures du programme et les libellés du formulaire
deviennent lisibles. Pour revenir à une fidélité stricte au wireframe, il suffit de
repointer ces deux tokens sur `--gold` dans `shared/palette.css`.

### Photo du couple

Les hero cherchent `/shared/img/couple.jpg`. **Le fichier n'existe pas encore** : tant
qu'il est absent, le dégradé émeraude sous-jacent fait office de fond et aucune image
cassée ne s'affiche. Déposer la photo à ce chemin suffit à l'activer (effet Ken Burns +
parallaxe déjà câblés).

### GSAP en CDN

GSAP 3.13.0 et ScrollTrigger sont chargés depuis cdnjs avec `integrity` (SRI sha384) et
`crossorigin` — un script tiers altéré serait rejeté par le navigateur.

---

## Notes techniques — Phases 4 & 5 (RSVP, carte, agenda)

### Qualité de la carte PDF

Trois décisions portent le rendu :

1. **Polices embarquées en base64** (`assets/fonts/`). Chromium headless n'a ni Great Vibes
   ni Cormorant installées : sans embarquement le PDF serait sorti en Georgia, c'est-à-dire
   sans le dessin de la carte. Vérifié via `pdffonts` : les faces sont bien intégrées au PDF.
   Cormorant Garamond est une **police variable** (wght 300–700, défaut **300**) — d'où le
   `font-weight: 300 700` dans le `@font-face`, sans lequel le texte sortirait trop maigre.
2. **QR en SVG inline**, pas en `<img>` : il reste vectoriel dans le PDF, donc net quelle que
   soit la taille d'impression.
3. **QR porté de 19 à 24 mm.** Mesure faite : l'URL fait 90 caractères, ce qui donne en
   correction Q un QR version 8 (49×49 modules + zone de silence = 57). À 19 mm cela faisait
   des modules de **0,333 mm**, sous le seuil d'environ 0,4 mm en dessous duquel un téléphone
   peine à lire un code imprimé. À 24 mm on est à **0,421 mm**. Décodage vérifié
   (OpenCV) sur le PDF rastérisé à 150/200/300 dpi.

### Performance du flux RSVP

| Étape | Durée |
|---|---|
| Rendu PDF, navigateur déjà lancé | ~350 ms |
| `POST /api/rsvp` complet (QR + PDF + aperçu + MinIO + base) | ~1,8–2,6 s |
| `GET /api/card/:id` (depuis MinIO) | ~0,8 s |
| `GET /api/ics/:id` | ~0,12 s |

Deux optimisations :
- **Chromium est lancé une seule fois** et réutilisé. Un lancement par requête ajouterait
  près d'une seconde à chaque RSVP.
- **Préchauffage au démarrage** (`bin/www`) : le coût de lancement est payé par un serveur
  au repos, pas par le premier invité qui confirme. Sans lui, la première soumission prenait
  4,8 s — au-dessus du budget de 1–3 s du PRD §4.2.

### Aperçu de la carte : image, pas PDF embarqué

L'aperçu affiché sur `/invitation/:id` est une **image WebP**, pas le PDF dans un `<object>`.
Constaté en test : un PDF embarqué déclenche un **téléchargement** au lieu de s'afficher sur
les navigateurs sans lecteur intégré (dont Safari et Chrome mobile) — désagréable à
l'ouverture de la page. L'image s'affiche partout, et bascule sur le QR si elle manque.

Format : WebP qualité 90, **62 Ko** contre 860 Ko pour le PNG équivalent, sans différence
visible sur ce dessin. Rendu à 727×1032 (ratio A5 exact) pour un affichage à 360 px.

### Le fichier `.ics` — compatibilité iOS / Android

Écrit à la main plutôt que via une librairie, parce que la compatibilité se joue sur des
détails qu'un générateur générique rate souvent :

| Point | Pourquoi |
|---|---|
| **CRLF** partout | Exigé par la RFC 5545 §3.1 ; iOS rejette un fichier en LF seuls |
| **Pliage à 75 octets**, jamais au milieu d'un caractère | Le texte est plein d'accents (2 octets en UTF-8) — plier à la longueur JS couperait un caractère en deux et corromprait le fichier |
| **VTIMEZONE + TZID** plutôt que de l'UTC brut | L'événement est ancré à Abidjan : un invité dont le téléphone est ailleurs voit l'heure convertie correctement (Paris 12h00, New York 06h00) au lieu d'une heure fausse |
| **VALARM avec ACTION + TRIGGER + DESCRIPTION** | `DESCRIPTION` est obligatoire pour une alarme `DISPLAY` ; iOS ignore les alarmes qui l'omettent |
| **UID stable par invité** | Un second téléchargement met à jour l'événement au lieu d'en créer un doublon |
| **`charset=utf-8` explicite** | Sans lui iOS décode mal les accents |
| `METHOD:PUBLISH` | Évite qu'Outlook affiche des boutons accepter/refuser |
| **Pas de `X-WR-CALNAME`** | Cette propriété nomme un *calendrier*, pas un événement. Sur un fichier à événement unique elle pousse certains clients (import Google Calendar) à créer un calendrier séparé au lieu d'ajouter l'événement à l'agenda de l'invité |

**Trois événements, pas un seul.** Le PRD §9 décrit un bloc unique 10h→20h. Écart assumé :
un `VEVENT` ne porte qu'**un** `LOCATION`, donc un bloc unique n'aurait rendu navigable qu'un
des trois lieux — l'itinéraire aurait pointé la mairie même à 16h. Découpé, chaque étape
porte son adresse et ses coordonnées propres.

| Étape | Horaire | Lieu | Rappels |
|---|---|---|---|
| Cérémonie civile | 10h00 → 12h00 | Mairie de Yopougon | **les 4** |
| Cérémonie religieuse | 13h30 → 15h30 | Église CMA de Port-Bouët 2 | — |
| Réception | 16h00 → 20h00 | Espace Royal KS | — |

Les rappels ne sont posés **que sur la première étape** : sur les trois, l'invité recevrait
douze notifications. Les horaires de fin intermédiaires (12h00, 15h30) sont des estimations,
à confirmer.

**Titres** : l'étape passe avant les prénoms (« Cérémonie civile — Franckesky & Charlène »).
Une vue mois tronque autour de 14 caractères : avec « Mariage de… » en tête, les trois lignes
auraient été indistinguables.

**Rappels** : J-7, J-3, J-1 (PRD §4.5) **plus un le matin même à 08h00** (`-PT2H`). Le PRD
n'en prévoit que trois ; le quatrième est ajouté volontairement, c'est le seul qui tombe
assez tard pour faire partir à l'heure.

### Coordonnées GPS des lieux

`GEO` + `X-APPLE-STRUCTURED-LOCATION` rendent le lieu tappable et activent sur iOS l'alerte
« il est temps de partir », calculée sur le trafic réel. Émis uniquement quand la coordonnée
existe — **aucune valeur approximative n'est inscrite**, un GPS faux enverrait les invités
au mauvais endroit.

| Lieu | Coordonnées | Source |
|---|---|---|
| Mairie de Yopougon | `5.3438879, -4.0674479` | OpenStreetMap, POI `amenity=townhall` (le bâtiment), confirmé par géocodage inverse |
| Église CMA de Port-Bouët 2 | **manquante** | Absente d'OSM, introuvable en recherche |
| Espace Royal KS | **manquante** | Absente d'OSM ; seul repère trouvé : « quartier Millionnaire, en face du Lycée Jeune Fille » |

Pour compléter : ouvrir Google Maps, appui long sur le point exact, relever les coordonnées,
puis les renseigner dans `STAGES[].geo` de `services/ics.service.js`. Le centroïde du quartier
Millionnaire (`5.3542896, -4.0602387`) a été écarté volontairement — plusieurs centaines de
mètres d'écart possible avec la salle.

Validé par un parseur indépendant (`python-icalendar`) : les 3 rappels tombent bien les
3, 7 et 9 octobre 2026. Fichier : **1,6 Ko**, généré à la volée en moins d'une milliseconde.

> **Reste à vérifier sur appareils réels.** Le fichier est conforme et validé par parseur,
> mais le *comportement de téléchargement* (.ics qui ouvre directement l'app Agenda vs qui
> atterrit dans les fichiers) dépend de la version d'iOS/Android et n'a pas pu être testé ici.
> Le bouton « Ajouter à mon agenda » reste toujours visible précisément pour cette raison.

### Résilience du flux (PRD §3.1, §9 étape 9)

Vérifié en coupant volontairement les accès MinIO :

- `POST /api/rsvp` répond quand même `{ success: true, id }` — l'invité n'est jamais bloqué ;
- `/invitation/:id` s'affiche ;
- `/api/card/:id` renvoie un 503 explicite au lieu d'une page d'erreur ;
- `/api/ics/:id` continue de fonctionner (aucune dépendance au stockage) ;
- l'échec est journalisé côté serveur.

La carte est régénérée à la demande dès que le stockage revient — y compris si
`cardMinioKey` pointe vers un objet absent du bucket (la clé seule ne prouve pas l'existence).

### Injection : noms d'invités

Les noms arrivent d'un formulaire public et finissent dans un HTML rendu par Chromium.
Cinq charges (`<script>`, `onerror`, sortie de `</style>`, …) ont été injectées comme nom :
toutes ressortent échappées, aucune ne s'exécute dans le navigateur de rendu, le nom
s'affiche littéralement sur la carte. L'échappement EJS `<%= %>` est la défense ; le seul
`<%- %>` du template reçoit du SVG généré par la librairie QR à partir d'un UUID, jamais
de saisie invité.

---

## Notes techniques — Phase 6 (backoffice)

### Session

Store **MySQL** (`express-mysql-session`), jamais en mémoire : table `sessions` créée
automatiquement à côté du schéma Prisma. Vérifié concrètement — une session reste valide
après redémarrage du serveur, ce qu'un store mémoire ne permet pas.

Le middleware de session n'est monté que sur `/admin` : un invité qui confirme sa présence
n'a aucune raison de recevoir un cookie de session, et le store reste vierge de lignes
anonymes (`saveUninitialized: false`).

Cookie (PRD §6), constaté dans l'en-tête `Set-Cookie` réel :

| Attribut | Valeur | Vérification |
|---|---|---|
| `httpOnly` | toujours | présent en dev et en prod |
| `secure` | en production | `NODE_ENV=production` + `X-Forwarded-Proto: https` → `Secure` émis |
| `sameSite` | `strict` | présent |
| `maxAge` | 8 h | `Expires` calculé et émis |
| nom | `fc.sid` | pas `connect.sid` : aucun indice gratuit sur la stack |

> ⚠️ **Piège de déploiement.** En production le cookie est `secure`, donc Express refuse de
> l'émettre sur une connexion qu'il ne considère pas comme HTTPS. Si le reverse proxy oublie
> `X-Forwarded-Proto: https`, le login répond **302 comme si tout allait bien mais ne pose
> aucun cookie** — l'admin reboucle indéfiniment sur le formulaire, sans erreur nulle part.
> Constaté en test. Le code journalise désormais explicitement ce cas.

### Connexion

- `bcrypt.compare` contre `AdminUser.passwordHash` ; le mot de passe en clair n'est jamais
  stocké ni journalisé.
- **Message unique** pour tous les échecs (« Identifiants incorrects. ») — vérifié identique
  entre « mauvais mot de passe » et « compte inexistant », donc aucune fuite sur l'existence
  des comptes.
- **Temps de réponse égalisé** : quand l'identifiant n'existe pas, la comparaison tourne quand
  même contre un vrai hash bcrypt généré au démarrage. Sans cela, « compte inexistant »
  répondrait bien plus vite et révélerait les comptes valides. Mesuré : 571 ms contre 607 ms,
  écart dans le bruit.
- **Rate limit** 5 tentatives / 15 min / IP sur `POST /admin/login` uniquement. Vérifié : la
  6e tentative renvoie 429, et le bon mot de passe est lui aussi bloqué pendant la fenêtre —
  comportement attendu face à du brute-force. Posé sur cette route seule, pour qu'un attaquant
  bloqué ne puisse pas faire tomber le formulaire RSVP public au passage.
- **Régénération de session** au login (`req.session.regenerate`) : un identifiant de session
  déposé avant la connexion ne reste pas valide après (fixation de session).
- **Déconnexion en POST**, pas en GET : un `GET /admin/logout` pourrait être déclenché par
  n'importe quelle balise `<img>` sur n'importe quel site.

### CSRF

Pas de jeton CSRF, et c'est délibéré : `sameSite: 'strict'` fait qu'un formulaire posté depuis
une autre origine **arrive sans cookie de session**. La requête est alors non authentifiée et
le middleware la renvoie au login. `csurf` est par ailleurs déprécié et non maintenu.

---

## Notes techniques — Phase 7 (durcissement, tests)

### En-têtes de sécurité (helmet)

`helmet` était installé mais **jamais branché** — corrigé. `X-Powered-By` est également
retiré : annoncer la stack ne sert qu'à celui qui cherche des CVE Express.

La CSP est **stricte, sans `'unsafe-inline'`** — possible uniquement parce que les pages ne
contiennent aucun style ni script inline (règle posée en Phase 3, PRD §4.1) :

```
default-src 'self' ; script-src 'self' https://cdnjs.cloudflare.com ;
style-src 'self' https://fonts.googleapis.com ; font-src 'self' https://fonts.gstatic.com data: ;
img-src 'self' data: ; connect-src 'self' ; frame-src 'self' ;
object-src 'none' ; base-uri 'none' ; form-action 'self' ; frame-ancestors 'none' ;
upgrade-insecure-requests
```

Si un gestionnaire inline se glisse un jour dans une page, il sera bloqué — et c'est le
résultat voulu : c'est la même règle qui empêche un `<script>` injecté de s'exécuter.

### Révocation des sessions admin

Constaté en test : un compte admin **supprimé gardait l'accès complet** au dashboard, sa
session survivant à la suppression. Même chose après un changement de mot de passe. Autrement
dit, « je crois qu'on a vu mon mot de passe, je le change » ne déconnectait personne.

Le middleware vérifie désormais la session contre la base à chaque requête, et compare une
empreinte du hash stocké. Conséquences, toutes deux vérifiées :

- supprimer le compte révoque immédiatement les sessions ;
- `npm run seed:admin` (rotation du mot de passe) devient aussi le bouton
  « déconnecter toutes les sessions ».

Coût : une lecture par clé primaire à chaque page du backoffice — négligeable ici.

### Génération de carte hors du chemin de réponse

La carte n'est plus générée pendant la requête RSVP. Mesures qui ont motivé le changement :

| Étape | Durée |
|---|---|
| Génération (QR + PDF + aperçu) | 331 ms |
| Upload PDF vers MinIO | 1358 ms |
| Upload aperçu | 243 ms |
| Écriture `cardMinioKey` | 875 ms |

Faire attendre l'invité coûtait ~3,7 s pour **rien** : la carte ne lui est pas remise dans
cette réponse. Elle est donc lancée sans être attendue, ce qui est exactement le chemin déjà
prévu au PRD §3.1 — une carte simplement *en retard* retombe dans le même cas qu'une carte
qui a échoué, et `/invitation/:id` la régénère à la demande.

Deux garde-fous : les générations sont **sérialisées** (une à la fois — plusieurs rendus
Chromium simultanés dégradent le temps de réponse de tout le monde), et une génération déjà
en cours est **rejointe** plutôt que dupliquée si la page d'invitation la redemande.

Résultat : `POST /api/rsvp` répond en **~0,55 s à chaud**, ~1,3 s sur la première requête
(connexion Prisma à froid). Budget PRD §4.2 : 1–3 s.

### Tests bout-en-bout (FC-025)

Parcours complet automatisé sur **6 combinaisons** — `/v1`, `/v2`, `/v3` × desktop (1280) et
mobile (390) — plus la page d'invitation. Tous les points passent :

chargement · retrait de l'overlay · GSAP chargé malgré la CSP · compte à rebours actif ·
absence de débordement horizontal · révélation du contenu au scroll · validation bloquant un
envoi vide · soumission réelle · confirmation affichée · lien vers la carte · doublon
renvoyant la carte existante · **aucune violation CSP** · aucune erreur JS · aperçu de carte
affiché · boutons carte et agenda présents · 2ᵉ visite ne rejouant pas le `.ics`.

> Une remarque de méthode : trois séries de mesures « lentes » (3 à 15 s par requête)
> provenaient de Chromium laissés en vie par mes propres scripts de test saturant la machine,
> et non du produit. Les chiffres ci-dessus sont ceux d'une machine au repos.

---

### Findings Semgrep connus (non corrigés à ce stade)

Après la phase 6, `semgrep ci --config auto` remonte 11 findings. Neuf sont des faux positifs
analysés un par un :

| Finding | Verdict |
|---|---|
| `puppeteer-setcontent-injection` (`pdf.service.js`) | Les seules valeurs d'invité passent par `<%= %>`, donc échappées — **prouvé par test d'injection**, cf. section ci-dessus |
| `template-explicit-unescape` (`<%- qrSvg %>`) | SVG produit par la librairie QR à partir d'un UUID de base, aucune saisie utilisateur |
| `var-in-script-tag` (`invitation.ejs`) | Attributs `data-*` échappés sur une balise `<script src>` sans corps inline |
| `direct-response-write` (`card.js`) | Envoi d'un `Buffer` binaire avec un `Content-Type` fixe, pas du HTML reflété |
| `path-join-resolve-traversal` (`pdf.service.js`) | Noms de fichiers de polices codés en dur, aucune donnée de requête |
| `express-check-csurf-middleware-usage` | `sameSite: 'strict'` : un POST cross-site arrive sans cookie de session, donc non authentifié (voir Phase 6) |
| `express-cookie-session-no-secure` | `secure: isProduction` est une variable, que la règle ne sait pas évaluer — **`Secure` vérifié présent** dans l'en-tête réel en production |
| `express-cookie-session-no-expires` | `maxAge` est défini ; express-session en dérive `Expires`, **constaté dans l'en-tête réel** |
| `express-cookie-session-no-domain` | `domain` volontairement omis : le cookie devient *host-only*, donc **plus** restrictif que s'il était renseigné |

Les deux restants proviennent du squelette `express-generator` standard, pas de code métier :
- **CSRF middleware absent** (`app.js`) — aucun formulaire n'est encore branché. La protection
  CSRF sera ajoutée avec les formulaires RSVP (Phase 4) et admin (Phase 6). `csurf` est déprécié :
  une alternative maintenue sera choisie à ce moment-là.
- **`http.createServer`** (`bin/www`) — point d'entrée standard. En production, TLS est terminé
  par le reverse proxy, pas dans l'application.
