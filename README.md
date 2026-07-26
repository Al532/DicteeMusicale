# Dictée musicale

Application web mobile de dictée mélodique :

- une phrase de 3 à 10 notes est jouée ;
- la première note est affichée comme référence ;
- les notes suivantes sont saisies sur un piano de deux octaves ;
- la correction est immédiate et l’octave jouée n’a pas d’importance ;
- les résultats restent sur l’appareil et peuvent être exportés en JSON ou CSV ;
- l’application fonctionne hors connexion après une première visite.

## Utilisation

Ouvrir l’application publiée sur GitHub Pages, choisir la longueur, le tempo et le type de
phrase, puis toucher **Commencer**. Sur Android, l’installation depuis le navigateur permet
de l’utiliser comme une application autonome.

## Statistiques

Une ligne par note est disponible dans l’export CSV : cible, intervalle mélodique, nombre
d’essais, réussite au premier coup, temps de réponse et nombre de réécoutes. La sauvegarde
JSON conserve toutes les données et peut être restaurée sur un autre appareil.

Les données ne quittent jamais le navigateur.

## Extraits de Charlie Parker

Le mode **Vocabulaire jazz** prélève des fragments consécutifs dans six solos de Charlie
Parker transcrits dans la
[Weimar Jazz Database](https://jazzomat.hfm-weimar.de/dbformat/dbcontent.html) :
*Billie’s Bounce*, *Donna Lee*, *Ornithology*, *Scrapple from the Apple*,
*Thriving on a Riff* et *Yardbird Suite*. Chaque exercice affiche le morceau, les mesures
et un lien vers sa fiche source.

Les hauteurs et positions proviennent du corpus de recherche public
[WJazzD v1.2 (2016)](https://github.com/jazzomat/article_2016), fichier `score.zip`. Les
fragments sont transposés aléatoirement par demi-tons pour tenir sur le clavier, sans
modifier leurs intervalles. La transposition appliquée est enregistrée dans les statistiques.

Les extraits commencent sur les frontières `PHRASE` annotées dans la WJazzD. Les positions
et durées originales des notes sont conservées : articulations, tenues, silences et éventuels
chevauchements restent donc audibles. Le réglage de tempo ralentit ou accélère l’ensemble
sans modifier ces proportions rythmiques.

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
