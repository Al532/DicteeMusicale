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

Un clavier compatible Web MIDI peut être activé depuis le bouton `MIDI` en
jeu. Les notes restent audibles jusqu’au relâchement de la touche ; seuls les
note-on comptent pour la réponse. À chaque tentative, l’octave de la première
note est automatiquement rapprochée de celle de la phrase, puis ce décalage
reste fixe jusqu’au prochain essai.

Le lecteur YouTube intégré ne s’affiche que pour les solos explicitement
validés dans `data/recording-validations.js`. L’interface publique ne propose
ni lien externe ni recherche de secours. Aucun enregistrement original n’est
embarqué dans l’application.

`data/youtube-search-recordings.js` contient un candidat pour chacun des 112
solos actuellement représentés par une phrase 3★. Chaque candidat correspond
au premier résultat de la recherche YouTube « musicien + morceau » effectuée
le 31 juillet 2026. Ces résultats ne deviennent jamais publics sans validation
manuelle.

## Mode développeur

Le menu discret en bas de l’accueil permet d’activer les outils de maintenance :

- notation rapide à trois étoiles ;
- revue et ajustement des phrases trois étoiles ;
- validation des enregistrements, du minutage et de plusieurs phrases d’un
  même solo, uniquement parmi les phrases trois étoiles ;
- comparaison directe entre la phrase jouée par l’application et l’extrait
  YouTube ;
- correction MIDI de la phrase sélectionnée directement depuis l’atelier ;
- explorateur indépendant de 364 motifs mélodiquement distinctifs du Pattern
  History Explorer de Dig That Lick, avec lecture automatique au défilement,
  originale ou transposée ;
- export central des notes, réglages de phrases et synchronisations YouTube.

L’atelier mémorise les vidéos validées, les mauvaises versions et les solos
indisponibles, puis avance automatiquement au prochain solo sans décision. Ces
données sont incluses dans le CSV produit depuis l’accueil développeur.

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

### Corpus Dig That Lick

`data/dtl-licks.js` reprend sans nouveau calcul les 653 motifs et les 11 630
occurrences du
[Pattern History Explorer](https://jazzomat.hfm-weimar.de/pattern_history/).
Pour chaque motif, le corpus ne conserve qu’une occurrence WJD interne afin de
restituer ses notes et son rythme réels. L’identité de cette occurrence n’est
jamais affichée. Les identifiants `dtl-ph-NNNN` suivent l’ordre du catalogue
DTL ; aucun clustering ni « lick moyen » n’est ajouté. L’explorateur écarte
ensuite les 289 motifs uniquement composés de répétitions, demi-tons et tons.
Les seuils statistiques « typique » et « très typique » restent disponibles
dans le code pour reconstruire le corpus : le second conserve 58 motifs et
1 300 occurrences exactes, avec notamment `log_excess_prob >= 2`.

L’explorateur et le Lick trainer utilisent les 58 motifs très typiques.
`data/dtl-rhythm-pilot.js` croise leurs 1 300 occurrences avec les accords et
la tonalité WJazzD. Les 19 contextes les plus nets conservent une fonction
harmonique majoritaire (`I`, `Im`, `V`, `II–V`, `V–I`, etc.) et le degré modal
de la première note : une fonction doit compter au moins trois observations,
représenter au moins 20 % des contextes de même nombre d’accords et 55 % des
fonctions identifiables ; le degré initial doit lui aussi atteindre 55 %. Ces
profils gardent les identifiants `P01` à `P19`. Les 39 profils harmoniquement
ambigus sont rétablis sous les identifiants `P20` à `P58`.

Le rythme interprété est volontairement uniforme : croches à 156 BPM avec un
swing léger de 1,4:1. Un motif à une harmonie place sa dernière note sur 1 ; un
motif à deux harmonies place la note de bascule sur le temps fort retenu. La
lecture commence au début de la mesure où entre le pattern : il peut donc y
avoir une introduction partielle, mais jamais une mesure entière à vide. La
basse n’est ajoutée que lorsque la fondamentale représentative et son éventuel
mouvement obtiennent une majorité stricte parmi les contextes harmoniques
identifiables : 35 profils ont ainsi une basse et les 23 autres restent
volontairement sans basse. Quand elle est présente, elle ne joue que sur les
temps 1 et sur le changement d’harmonie ; chaque note tient jusqu’à la suivante
et la dernière dépasse légèrement l’arrivée. Le hi-hat marque 2 et 4.
L’occurrence WJD de référence reste disponible pour comparaison.

Pour régénérer ce corpus, télécharger `pattern_stats.RDS` avec le lien
« Download data as RDS » de l’explorateur, puis lancer :

```bash
python -m pip install -r scripts/requirements-dtl.txt
npm run dtl:import -- /chemin/vers/pattern_stats.RDS
```

Le script lit la liste officielle des occurrences, choisit la première encore
compatible avec l’export WJazzD local, puis extrait les hauteurs, timings et
tempo dans le corpus compact.

Pour régénérer le pilote depuis la base SQLite publique WJazzD :

```bash
npm run dtl:rhythm-pilot -- /chemin/vers/wjazzd.db
```

Pour intégrer le dernier export central :

```bash
npm run ratings:generate -- /chemin/vers/dictee-musicale-donnees-AAAA-MM-JJ.csv data/default-ratings.js
```

Cette commande régénère aussi `data/default-phrase-settings.js` et, lorsque le
CSV contient les colonnes YouTube, `data/recording-validations.js`.

## Licence

Code sous licence MIT. La WJazzD est distribuée sous licence ODbL.
