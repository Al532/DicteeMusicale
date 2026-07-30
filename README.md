# Jazz Solo Challenge

PWA de dictée mélodique construite à partir des 456 solos de la
[Weimar Jazz Database](https://jazzomat.hfm-weimar.de/dbformat/dbcontent.html).
L’expérience publique est volontairement centrée sur un seul parcours guidé.

## Défi 3×3

À chaque tirage, les phrases 3★ disponibles sont classées par leur longueur
réelle puis réparties dynamiquement en trois tiers. Une session prend une phrase
dans chacun de ces pools, dans l’ordre : courte, moyenne, longue. Les catégories
s’adaptent donc automatiquement à l’évolution du corpus au lieu de dépendre de
seuils figés.

Seules les phrases évaluées 3★ sont proposées. Chacune doit être réussie dans
trois tonalités consécutives avant de passer à la suivante, soit neuf manches.
La longueur est définie phrase par phrase ; vingt notes reste la valeur par
défaut lorsqu’aucun réglage particulier n’a été enregistré.

La session se termine par une mort subite :

- les trois phrases reviennent à tour de rôle ;
- les réécoutes restent libres avant de jouer ;
- la première note lancée ouvre l’unique tentative ;
- une erreur renvoie immédiatement la phrase en fin de file ;
- à son retour, elle est proposée dans une nouvelle tonalité ;
- une réussite retire définitivement la phrase du round.

Chaque phrase conserve son propre cycle de douze tonalités, tonalité originale
comprise. Les douze sont épuisées sans répétition avant un nouveau tirage, y
compris entre les neuf manches et la mort subite.

La session en cours est sauvegardée localement et peut être reprise. Les phrases
déjà terminées sont évitées ; chaque catégorie de longueur recommence son cycle
seulement lorsqu’elle a été épuisée.

## Favoris et mode libre

Une phrase peut être ajoutée aux favoris pendant le jeu. Le mode libre présente
ces favoris sous forme de liste, puis permet de les écouter, les rejouer et les
transposer sans objectif de session.

Dans le parcours normal, seules les informations essentielles sont affichées :
musicien et morceau. La tonalité reste volontairement masquée.

## Son et lecture

La mélodie et le clavier publics utilisent le son synthétique. Les instruments
échantillonnés de clarinette et de piano restent conservés mais ne sont pas
exposés dans l’interface. Les fondamentales de basse suivent les accords
annotés ; un chick de charleston marque les temps 2 et 4. La vitesse se règle
directement sous le clavier pendant le jeu.

Lorsqu’une synchronisation [JazzTube](https://mir.audiolabs.uni-erlangen.de/jazztube/)
existe, l’enregistrement s’ouvre au début exact de la phrase dans un lecteur
YouTube intégré, sans quitter l’application.
Le lecteur permet aussi de choisir une autre version référencée et d’ouvrir
YouTube directement. Les extraits locaux des six solos de Charlie Parker
restent prioritaires et disponibles hors ligne.

JazzTube référence actuellement 329 des 456 solos du corpus. Pour les autres,
l’application propose une recherche YouTube ciblée par musicien, morceau et
date, sans prétendre fournir un minutage qui n’a pas été vérifié. Les
correspondances peuvent être régénérées avec :

```bash
npm run recordings:generate
```

## Mode développeur

Le menu discret en bas de l’accueil permet d’activer les outils de maintenance :

- notation rapide à trois étoiles ;
- revue et ajustement des phrases trois étoiles ;
- export du protocole.

Les rejets structurels et les inférences globales à 1★ restent gérés par le
protocole existant. Une note directe demeure toujours prioritaire.

## Développement

L’application n’a aucune dépendance d’exécution.

```bash
npm test
npm run check
```

Pour reconstruire les données après téléchargement de `wjazzd.db` :

```bash
python scripts/generate_wjazzd_data.py /chemin/vers/wjazzd.db data/wjazzd-solos.js
npm run corpus:generate
```

La seconde commande régénère l’index compact et les 57 blocs chargés à la
demande par le runtime, puis préchauffés en arrière-plan par le service worker
pour garantir le corpus hors ligne. Les mesures reproductibles de démarrage
sont disponibles avec `npm run measure:startup` et documentées dans
[`docs/startup-performance.md`](docs/startup-performance.md).

Pour intégrer le dernier export du protocole :

```bash
npm run ratings:generate -- /chemin/vers/dictee-musicale-protocole-AAAA-MM-JJ.csv data/default-ratings.js
```

## Licence

Code sous licence MIT. La WJazzD est distribuée sous licence ODbL.
