# Mesures de démarrage

Les mesures comparent `main` au commit
`56fc8664253a44018aa4d24e4622c7753c10cd3b` avec la version découpée du
corpus. Elles sont reproductibles avec :

```sh
npm run measure:startup
```

Le script mesure cinq processus Node neufs avec JSDOM et ramasse la mémoire
avant et après l’exécution réelle de `src/app.js`. La mesure ci-dessous a été
effectuée avec Node.js v24.14.0. Le script calcule aussi le graphe d’imports
statiques et ses tailles brute, gzip et Brotli. Ces valeurs sont un proxy
stable pour comparer les versions ; elles ne prétendent pas représenter le
temps d’un téléphone ou le transfert HTTP exact d’un CDN.

## Résultats

| Mesure médiane | Avant | Après | Évolution |
|---|---:|---:|---:|
| Modules JavaScript initiaux | 14 | 22 | modules plus petits et spécialisés |
| JavaScript initial brut | 7 502 525 o | 804 389 o | −89,3 % |
| JavaScript initial gzip | 2 574 806 o | 134 835 o | −94,8 % |
| JavaScript initial Brotli | 1 785 694 o | 108 577 o | −93,9 % |
| Interface initiale brute | 7 556 639 o | 866 171 o | −88,5 % |
| Interface initiale gzip | 2 586 205 o | 147 252 o | −94,3 % |
| Interface initiale Brotli | 1 795 336 o | 119 058 o | −93,4 % |
| Import/analyse et initialisation jusqu’à l’interface utilisable (JSDOM) | 241,39 ms | 79,77 ms | −67,0 % |
| Hausse du tas JavaScript | 60 904 872 o | 5 256 208 o | −91,4 % |
| Hausse RSS | 124 383 232 o | 8 912 896 o | −92,8 % |

L’index compact pèse 327 163 octets bruts, 57 426 octets avec le même
`gzipSync` que le script de mesure, et 45 593 octets Brotli. Le premier bloc
détaillé pèse 164 068 octets bruts et 60 493 octets gzip. Les 57 blocs
représentent ensemble 7 017 299 octets bruts et 2 545 858 octets gzip : la
découpe n’augmente donc que faiblement le coût total, mais retire ces données
du démarrage.

## Interprétation

Le graphe initial contient l’index, mais ni `data/wjazzd-solos.js` ni
`data/wjazzd-chords.js`. L’application n’importe ni n’analyse aucun bloc
détaillé sur son chemin critique ; le bloc utile est demandé lorsqu’une phrase
est choisie. Les anciens monolithes restent uniquement comme source de
génération et comme référence de parité dans les tests.

Les candidats issus des recherches YouTube ne sont chargés qu’à l’ouverture
de l’atelier développeur de validation.

Le service worker installe d’abord le cœur de l’interface et l’index. Son
installation continue ensuite en arrière-plan, sans bloquer la page déjà
affichée, avec les 57 blocs, les basses et les six originaux Parker. Cette
préparation hors ligne représente 19 388 732 octets de blocs, manifeste et
médias locaux, auxquels s’ajoute le cœur de l’interface. Elle est distincte du
chemin critique mesuré ci-dessus.

Le worker n’active la nouvelle version qu’après réussite complète : une coupure
réseau conserve donc l’ancien worker au lieu d’annoncer silencieusement un mode
hors ligne incomplet. En exécution, tout bloc sélectionné suit aussi une
stratégie cache-first et est donc mis en cache à la demande.
