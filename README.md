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
Les extraits sont limités aux vingt premières notes.

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

La mélodie et le clavier utilisent le son synthétique. Les fondamentales de
basse suivent les accords annotés ; un chick de charleston marque les temps 2
et 4. La vitesse se règle directement sous le clavier pendant le jeu.

Six enregistrements calibrés restent accessibles dans les outils développeur
pour *Billie’s Bounce*, *Donna Lee*, *Ornithology*, *Scrapple from the Apple*,
*Thriving on a Riff* et *Yardbird Suite*.

## Mode développeur

Le menu discret en bas de l’accueil permet d’activer les outils historiques :

- phrases réelles ou générées ;
- sélection des musiciens ;
- filtre de notation ;
- notation rapide à trois étoiles ;
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
```

Pour intégrer le dernier export du protocole :

```bash
npm run ratings:generate -- /chemin/vers/dictee-musicale-protocole-AAAA-MM-JJ.csv data/default-ratings.js
```

## Licence

Code sous licence MIT. La WJazzD est distribuée sous licence ODbL.
