# Dictée musicale

Application web mobile de dictée mélodique :

- une séquence aléatoire de 3 à 10 notes ou une phrase Parker complète est jouée ;
- la première note est jouée et repérée sur le clavier, mais doit être saisie avant d’être
  révélée dans la séquence ;
- les autres notes ne sont jamais montrées pendant la lecture ;
- les notes suivantes sont saisies dans leur octave exacte sur un piano adaptatif ;
- le clavier affiche au moins deux octaves et s’étend si l’ambitus l’exige ;
- les notes déjà trouvées peuvent être réécoutées en touchant leur bouton ;
- les résultats restent sur l’appareil et peuvent être exportés en JSON ou CSV ;
- l’application fonctionne hors connexion après une première visite.

## Utilisation

Ouvrir l’application publiée sur GitHub Pages, choisir le mode, puis toucher **Commencer** :
le mode de jeu s’ouvre automatiquement en plein écran paysage. Le clavier n’est pas affiché
sur l’écran principal.
Sur Android, l’installation depuis le navigateur permet de l’utiliser comme une application
autonome. Le jeu contient les commandes **Réécouter** et **Suivant** ainsi que le réglage de
vitesse Parker. Si le navigateur ne peut pas verrouiller l’orientation, il demande de tourner
manuellement l’appareil.

Deux modes sont disponibles, avec **Phrases réelles** sélectionné par défaut :

- **Phrases réelles — Charlie Parker** : une des 104 phrases annotées est jouée intégralement.
  Un réglage de 25 à 100 % permet de ralentir la vitesse originale ; sa modification est prise
  en compte lors de chaque réécoute. Le bouton **Réécouter** devient **Stop** pendant la lecture.
- **Aléatoire — Markov Parker** : de 3 à 10 notes, avec une vitesse réglable de 50 à
  320 %. À 100 %, une nouvelle note commence toutes les 600 ms ; 320 % correspond exactement
  au double de l’ancien maximum. Chaque note est tenue legato jusqu’à l’attaque suivante.
  Les intervalles sont générés par un modèle de Markov à ordre variable, entraîné sur les 1 584 transitions
  internes aux phrases du corpus. Il utilise jusqu’aux six intervalles précédents lorsque
  le contexte a été observé plusieurs fois, puis se replie progressivement vers les ordres
  inférieurs. Une séquence ne peut ni reproduire exactement une phrase du corpus, ni en
  recopier plus de sept intervalles consécutifs.

## Statistiques

Une ligne par note est disponible dans l’export CSV : cible, intervalle mélodique, nombre
d’essais, réussite au premier coup, temps de réponse et nombre de réécoutes. La sauvegarde
JSON conserve toutes les données et peut être restaurée sur un autre appareil.

Les données ne quittent jamais le navigateur.

## Extraits de Charlie Parker

Le mode **Phrases réelles — Charlie Parker** utilise les phrases complètes de six solos
transcrits dans la
[Weimar Jazz Database](https://jazzomat.hfm-weimar.de/dbformat/dbcontent.html) :
*Billie’s Bounce*, *Donna Lee*, *Ornithology*, *Scrapple from the Apple*,
*Thriving on a Riff* et *Yardbird Suite*. Chaque exercice affiche le morceau, le numéro de
phrase, les mesures et un lien vers sa fiche source.

Les hauteurs et positions proviennent du corpus de recherche public
[WJazzD v1.2 (2016)](https://github.com/jazzomat/article_2016), fichier `score.zip`. Les
phrases sont transposées uniformément dans les 12 classes chromatiques, sans modifier leurs
intervalles et sans dépasser six demi-tons. Pour le triton, +6 et −6 se partagent le poids
d’une seule transposition. La transposition appliquée est enregistrée dans les statistiques.

Le clavier suit le registre réel de la phrase transposée. Il est composé de chunks indivisibles
**do–mi** et **fa–si**, centrés autour de la phrase, avec un minimum de quatre chunks. Des
chunks supplémentaires sont ajoutés lorsque l’ambitus l’exige.

Les extraits commencent sur les frontières `PHRASE` annotées dans la WJazzD. Les positions
et durées originales des notes sont conservées : articulations, tenues, silences et éventuels
chevauchements restent donc audibles. Le réglage en pourcentage ralentit l’ensemble sans
modifier ces proportions rythmiques. Un chick de charleston discret marque les temps 2 et 4
(le temps 2 seul dans une mesure à trois temps), d’après les positions de temps du corpus.
Il n’est joué qu’entre le départ de la première note et la fin de la dernière.

Le fichier navigateur est généré depuis la base SQLite avec
`scripts/generate_parker_data.py`, afin de conserver une provenance reproductible. La version
historique de la base ne numérote pas directement les temps dans sa table `beats` : leur phase
est retrouvée de façon déterministe à partir des numéros de temps des notes de chaque solo.

## Développement

L’application n’a aucune dépendance externe.

```bash
npm test
npm run check
```

Pour reconstruire les données Parker après téléchargement de `wjazzd.db` :

```bash
python scripts/generate_parker_data.py /chemin/vers/wjazzd.db data/parker-solos.js
```

## Licence

MIT
