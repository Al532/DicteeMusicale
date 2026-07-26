# Dictée musicale

Application web mobile de dictée mélodique :

- une séquence aléatoire de 3 à 10 notes ou une phrase Parker complète est jouée ;
- la première note est affichée comme référence ;
- les autres notes ne sont jamais montrées pendant la lecture ;
- les notes suivantes sont saisies sur un piano de deux octaves ;
- la correction est immédiate et l’octave jouée n’a pas d’importance ;
- les résultats restent sur l’appareil et peuvent être exportés en JSON ou CSV ;
- l’application fonctionne hors connexion après une première visite.

## Utilisation

Ouvrir l’application publiée sur GitHub Pages, choisir le mode, puis toucher **Commencer**.
Sur Android, l’installation depuis le navigateur permet de l’utiliser comme une application
autonome.

Deux modes sont disponibles :

- **Aléatoire — statistiques Parker** : de 3 à 10 notes, à tempo réglable. Chaque intervalle
  signé est tiré indépendamment dans les 1 584 transitions observées à l’intérieur des
  phrases du corpus.
- **Phrases réelles — Charlie Parker** : une des 104 phrases annotées est jouée intégralement.
  Un réglage de 25 à 100 % permet de ralentir la vitesse originale ; sa modification est prise
  en compte lors de chaque réécoute.

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
phrases sont transposées aléatoirement par demi-tons, sans modifier leurs intervalles. La
transposition appliquée est enregistrée dans les statistiques.

Les extraits commencent sur les frontières `PHRASE` annotées dans la WJazzD. Les positions
et durées originales des notes sont conservées : articulations, tenues, silences et éventuels
chevauchements restent donc audibles. Le réglage en pourcentage ralentit l’ensemble sans
modifier ces proportions rythmiques.

Le fichier navigateur est généré depuis la base SQLite avec
`scripts/generate_parker_data.py`, afin de conserver une provenance reproductible.

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
