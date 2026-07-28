# Sur les traces des maîtres du jazz — Ear Training

Dictée mélodique construite à partir des 456 solos de la
[Weimar Jazz Database](https://jazzomat.hfm-weimar.de/dbformat/dbcontent.html).
L’application joue une phrase réelle ou une phrase générée à partir du langage des
solistes sélectionnés, puis demande de la retrouver intégralement au clavier.

- 456 solos, 78 musiciens, 11 082 phrases annotées et 200 809 notes ;
- filtre persistant des musiciens utilisés dans les deux modes ;
- séquences de 3 à 15 notes en mode généré ;
- extraits de 5 à 15 notes en mode réel ;
- transposition uniforme dans les 12 tons ;
- rythmes, silences et articulations issus des transcriptions ;
- statistiques locales exportables en JSON ou CSV ;
- fonctionnement hors connexion après une première visite.

## Utilisation

La page d’accueil propose deux modes :

- **Phrases réelles** tire une phrase annotée parmi les solos des musiciens cochés.
  La vitesse peut être réglée de 25 à 100 % sans modifier les proportions rythmiques.
- **Phrases générées** utilise un modèle de Markov à ordre variable construit à la volée
  uniquement à partir des musiciens cochés. La longueur est réglable de 3 à 15 notes.

Le menu **Musiciens inclus** permet de sélectionner individuellement les 78 solistes,
de tout sélectionner, de tout désélectionner ou de restaurer le préréglage
**Jazz classique** :

Louis Armstrong, Coleman Hawkins, Lester Young, Charlie Parker, Dizzy Gillespie,
Miles Davis, Clifford Brown, Chet Baker, Sonny Rollins, John Coltrane,
Cannonball Adderley, Dexter Gordon et Stan Getz.

La sélection est conservée sur l’appareil. Au moins un musicien doit être coché pour
lancer un exercice.

## Modèle mélodique

Le modèle de Markov est reconstruit et mis en cache pour chaque sélection de musiciens.
Il utilise jusqu’aux huit intervalles précédents lorsque le contexte a été observé au
moins deux fois, puis se replie progressivement vers les ordres inférieurs.

Les fragments existants ne sont pas exclus : le générateur peut volontairement retrouver
et prolonger des licks présents dans les solos sources.

## Phrases réelles et enregistrements

Les hauteurs, positions, durées, mesures, temps et limites `PHRASE` proviennent de la
WJazzD v2.1 (base v2.2). Chaque exercice indique le musicien, le morceau, la phrase,
les mesures et renvoie vers la fiche officielle.

Six enregistrements déjà calibrés sont disponibles pour *Billie’s Bounce*,
*Donna Lee*, *Ornithology*, *Scrapple from the Apple*, *Thriving on a Riff* et
*Yardbird Suite*. Le bouton **Écouter l’original**, son option de transposition et le
lien vers l’enregistrement sont entièrement masqués pour les autres solos.

Le clavier suit le registre réel de la phrase transposée. Il est composé de zones
indivisibles **do–mi** et **fa–si**, avec un minimum de quatre zones. Un chick de
charleston discret marque les temps 2 et 4 lorsqu’ils existent dans l’annotation.

## Statistiques

Une ligne par note est disponible dans l’export CSV : cible, intervalle mélodique,
nombre d’essais, réussite au premier coup, temps de réponse et nombre de réécoutes.
La sauvegarde JSON peut être restaurée sur un autre appareil. Les données ne quittent
jamais le navigateur.

## Développement

L’application n’a aucune dépendance externe.

```bash
npm test
npm run check
```

Pour reconstruire les données après téléchargement de `wjazzd.db` :

```bash
python scripts/generate_wjazzd_data.py /chemin/vers/wjazzd.db data/wjazzd-solos.js
```

Le script `scripts/calibrate_parker_audio.py` reste disponible pour recalibrer les six
enregistrements historiques.

## Licence

Code sous licence MIT. La WJazzD est distribuée sous licence ODbL.
