const numberFormatters = new Map();

function formatNumberFor(locale, value) {
  if (!numberFormatters.has(locale)) {
    numberFormatters.set(locale, new Intl.NumberFormat(locale));
  }
  return numberFormatters.get(locale).format(value);
}

function plural(count, singular, pluralForm) {
  return Number(count) === 1 ? singular : pluralForm;
}

const messages = {
  en: {
    "meta.description":
      "Play jazz solo phrases back by ear in every key.",
    "home.install": "Install",
    "home.intro":
      "Play jazz solo phrases back by ear, in every key.",
    "home.rule.aria": "Challenge format",
    "home.rule.phrases": "phrases",
    "home.rule.keysEach": "keys each",
    "home.rule.then": "then",
    "home.rule.suddenDeath": "sudden death",
    "home.start": "Start",
    "home.resume": "Resume",
    "home.freeMode": "Free mode",
    "home.favorites": "My favorite phrases",
    "home.restart": "Quit and start over",
    "developer.tools": "Developer tools",
    "developer.mode": "Developer mode",
    "developer.workshop": "Workshop",
    "developer.corpusRatings": "Corpus and ratings",
    "developer.exportProtocol": "Export protocol",
    "developer.exportData": "Export data",
    "developer.realPhrase": "Real phrase",
    "developer.generatedPhrase": "Generated phrase",
    "developer.quickRating": "Quick rating",
    "developer.threeStarReview": "Review 3-star phrases",
    "developer.musiciansIncluded": "Included musicians",
    "developer.classicJazz": "Classic jazz",
    "common.all": "All",
    "common.none": "None",
    "developer.maxNotes": "Max notes",
    "developer.notes": "Notes",
    "developer.minimumRating": "Minimum rating",
    "developer.allPhrases": "All phrases",
    "developer.unratedPhrases": "Unrated phrases",
    "developer.twoStars": "2 stars or more",
    "developer.threeStars": "3 stars only",
    "developer.calculatingCoverage": "Calculating coverage…",
    "developer.selectMusician": "Select at least one musician.",
    "favorites.back": "Back",
    "favorites.kicker": "Free mode",
    "favorites.title": "My phrases",
    "favorites.intro":
      "Choose a phrase, then explore it freely in all twelve keys.",
    "favorites.empty.title": "No favorite phrases",
    "favorites.empty.body":
      "Add favorites during a challenge to find them here.",
    "game.exitSession": "Exit session",
    "challenge.kicker": "3×3 Challenge",
    "game.listenFind": "Listen, then find the phrase",
    "favorites.add": "Add to favorites",
    "game.getReady": "Get ready…",
    "rating.quick.aria": "Quickly rate this phrase",
    "rating.discard": "Discard",
    "rating.keep": "Keep",
    "rating.recommend": "Recommend",
    "rating.checkpoint": "Checkpoint",
    "rating.undo": "Undo last rating",
    "source.copy": "Copy",
    "source.source": "Source",
    "source.recording": "Recording",
    "game.speed": "Speed",
    "game.playbackSpeed": "Playback speed",
    "game.replay": "Replay",
    "free.otherKey": "Another key",
    "common.next": "Next",
    "common.skip": "Skip",
    "phrase.length": "Length",
    "phrase.shortNotes": "Short notes",
    "phrase.lengthDecrease": "Reduce phrase length",
    "phrase.lengthIncrease": "Increase phrase length",
    "phrase.shortNotesDecrease": "Restore one short note",
    "phrase.shortNotesIncrease": "Ignore one more short note",
    "rating.aria": "Rate this phrase",
    "rating.oneStar": "Rate 1 star",
    "rating.twoStars": "Rate 2 stars",
    "rating.threeStars": "Rate 3 stars",
    "game.listenOriginal": "Play original",
    "game.transpose": "Transpose",
    "ios.kicker": "On iPhone and iPad",
    "ios.title": "Install the app",
    "ios.stepSafari": "Open this page in Safari.",
    "ios.stepShareBefore": "Tap the",
    "ios.share": "Share",
    "ios.stepShareAfter": "button.",
    "ios.stepAddBefore": "Choose",
    "ios.addToHome": "Add to Home Screen",
    "ios.stepAddAfter": ".",
    "ios.done": "Got it",
    "sudden.kicker": "Final round",
    "sudden.title": "Sudden death",
    "sudden.body":
      "Replay as often as needed. Once you play your first note, you have one attempt. Make a mistake, and the phrase will return later in another key.",
    "sudden.ready": "I’m ready",
    "complete.kicker": "Session complete",
    "complete.title": "Challenge complete",
    "complete.body":
      "Three phrases learned, each found on the first try.",
    "complete.new": "New challenge",
    "complete.home": "Back to home",
    "completion.kicker": "Phrase complete",
    "completion.title": "Well done!",
    "completion.restart": "Start over",
    "completion.exit": "Exit",
    "rotate.title": "Rotate your device",
    "rotate.body": "Jazz Solo Challenge is played in landscape.",
    "rotate.exit": "Exit",
    "mode.generated": "Generated phrases",
    "mode.free": "Free mode",
    "mode.suddenDeath": "Sudden death",
    "mode.challenge": "3×3 Challenge",
    "mode.review": "3-star review",
    "game.explorePhrase": "Explore the phrase",
    "game.firstTry": "First try",
    "rating.listenRate": "Listen, then rate the phrase",
    "review.listenAdjust": "Listen, then adjust the phrase",
    "review.previous": "Previous phrase",
    "review.next": "Next phrase",
    "review.progress": ({ current, total }) => `${current} of ${total}`,
    "review.empty": "No 3-star phrase remains to review.",
    "rating.setEnd": "End here",
    "rating.setEndAria": "Set the phrase end at the current playback position",
    "audio.stop": "Stop",
    "audio.listenOriginal": "Play original",
    "audio.listenCarefully": "Listen carefully…",
    "instrument.clarinet": "clarinet",
    "instrument.piano": "piano",
    "audio.loadingRecording": "Loading recording…",
    "audio.transposingRecording": "Transposing recording…",
    "audio.recording": ({ transposition }) =>
      `Original recording${transposition ? ` transposed ${transposition > 0 ? "+" : ""}${transposition}` : ""}…`,
    "audio.readError": "Unable to play this recording.",
    "audio.originalStopped": "Original playback stopped. Your turn.",
    "rating.prompt": "Rate 1, 2 or 3 stars — keys 1, 2 or 3.",
    "rating.adjustedPreview":
      "Saved. Listen to the adjusted excerpt, then refine it with − / +.",
    "sudden.instructions":
      "Replay if needed. Your first note will start your only attempt.",
    "game.findNote": ({ current, total }) =>
      `Your turn — find note ${current} of ${total}.`,
    "protocol.direct": ({ count }) =>
      `${count} direct ${plural(count, "rating", "ratings")}`,
    "protocol.covered": ({ covered, total }) =>
      `${covered} of ${total} phrases covered`,
    "protocol.structuralExcluded": ({ count }) =>
      `${count} structural ${plural(count, "exclusion", "exclusions")}`,
    "protocol.globalDecisions": ({ count }) =>
      `${count} global ${plural(count, "decision", "decisions")}`,
    "performers.selected": ({ selected, total, solos }) =>
      `${selected} of ${total} · ${solos} ${plural(solos, "solo", "solos")}`,
    "performers.optionTitle": ({ name, solos }) =>
      `${name} — ${solos} ${plural(solos, "solo", "solos")}`,
    "session.training": ({ phrase, tone }) =>
      `Session in progress · phrase ${phrase} of 3, key ${tone} of 3.`,
    "session.transition":
      "All nine rounds complete · sudden death ready to start.",
    "session.sudden": ({ count }) =>
      `Sudden death in progress · ${count} ${plural(count, "phrase", "phrases")} remaining.`,
    "favorites.removeSpecific": ({ performer, title }) =>
      `Remove ${performer}, ${title} from favorites`,
    "favorites.remove": ({ subject = "" }) =>
      `Remove${subject ? ` ${subject}` : ""} from favorites`,
    "favorites.addSubject": ({ subject = "" }) =>
      `Add${subject ? ` ${subject}` : ""} to favorites`,
    "challenge.progressPhrase": ({ current }) => `Phrase ${current} of 3`,
    "challenge.progressTone": ({ current }) => `Key ${current} of 3`,
    "challenge.remaining": ({ count }) =>
      `${count} ${plural(count, "phrase", "phrases")} to complete`,
    "piano.range": ({ chunks, start, end }) =>
      `Piano with ${chunks} ${plural(chunks, "zone", "zones")}, from ${start} to ${end}`,
    "rating.sessionCount": ({ count }) =>
      `${count} ${plural(count, "phrase", "phrases")} rated${count ? "" : " in this session"}`,
    "rating.sessionDistribution": ({ one, two, three }) =>
      `${one} / ${two} / ${three} at 1★ / 2★ / 3★`,
    "rating.coverage": ({ covered, total, percent }) =>
      `${covered} of ${total} phrases covered (${percent}%)`,
    "rating.newGlobalDecisions": ({ count }) =>
      `${count} new global ${plural(count, "decision", "decisions")}`,
    "rating.current": ({ rating }) =>
      `Current rating: ${rating} ${plural(rating, "star", "stars")}`,
    "rating.unrated": "Unrated phrase",
    "rating.checkpointEntered": ({ count }) =>
      `Checkpoint: ${count} ratings entered.`,
    "rating.recorded": ({ rating }) =>
      `${rating} ${plural(rating, "star", "stars")} saved.`,
    "rating.undone": "Last rating undone.",
    "rating.allCovered":
      "All selected phrases are covered by the protocol.",
    "phrase.unavailable": "This phrase is unavailable.",
    "phrase.noneAvailable": "No phrase available.",
    "selection.real": "Select at least one musician for real phrases.",
    "source.originalKey": "original key",
    "source.transposition": ({ value }) =>
      `transposition ${value > 0 ? "+" : ""}${value} semitones`,
    "source.originalTempo": ({ tempo }) => `original tempo ${tempo} BPM`,
    "source.details": ({ label, details }) =>
      `Source: ${label}${details ? ` · ${details}` : ""}.`,
    "source.copyId": ({ id }) => `Copy identifier ${id}`,
    "source.view": "View source",
    "source.recordingLink": "Source recording",
    "source.copied": "Copied",
    "source.copyFailed": "Failed",
    "source.generatedModel": ({ maxOrder, intervalCount, performerCount }) =>
      `Generated by a variable-order Markov model (max. ${maxOrder}) from ${formatNumberFor("en", intervalCount)} intervals by ${performerCount} ${plural(performerCount, "soloist", "soloists")}`,
    "source.transcription": ({
      performer,
      title,
      phrase,
      barStart,
      barEnd,
      noteCount,
      truncated,
    }) => {
      const bars =
        barStart === barEnd ? `bar ${barStart}` : `bars ${barStart}–${barEnd}`;
      const excerpt = truncated ? `, ${noteCount}-note excerpt` : "";
      return `${performer}, “${title}”, phrase ${phrase}, ${bars}${excerpt}`;
    },
    "playback.suddenLocked":
      "Attempt in progress — finish the phrase without replaying.",
    "playback.stopped": "Playback stopped. Start again from the first note.",
    "playback.mistake": "Wrong — replaying from the beginning.",
    "playback.suddenFailed": "Missed — moving to the next phrase.",
    "playback.interrupted": "Playback interrupted. Your turn.",
    "playback.attemptStarted": "Attempt started.",
    "playback.correct": ({ current, total }) =>
      `Correct. Note ${current} of ${total}.`,
    "playback.progress": ({ current, total }) => `${current} of ${total}.`,
    "finish.toneValidated": "Key complete.",
    "finish.suddenValidated": "Phrase completed on the first try.",
    "finish.free": "Phrase complete. Replay it or change key.",
    "finish.phrase": "Phrase complete.",
    "fullscreen.enter": "Full screen",
    "fullscreen.exit": "Exit full screen",
    "fullscreen.enterAria": "Enter full screen",
    "error.minimumChallenge":
      "At least three 3★ phrases are needed to create a challenge.",
    "error.repeatedKey": "A key cannot repeat within the same cycle.",
    "error.exactChallenge":
      "A challenge must contain exactly three phrases.",
    "error.distinctChallenge":
      "The three challenge phrases must be distinct.",
    "error.phraseRequired":
      "A phrase is required to build the keyboard.",
    "error.selectMusician": "Select at least one musician.",
    "error.ratingFilter": "No phrase matches the star filter.",
    "error.registerTransition":
      "No transition is compatible with the register.",
    "error.filters": "No phrase matches the selected filters.",
    "error.recordingUnavailable": ({ status }) =>
      `Recording unavailable (${status})`,
    "error.bassSampleUnavailable": ({ status }) =>
      `Bass sample unavailable (${status})`,
    "error.melodySampleUnavailable": ({ instrument, status }) =>
      `${instrument} sample unavailable (${status})`,
  },
  fr: {
    "meta.description":
      "Rejouez à l’oreille des phrases de solos de jazz dans tous les tons.",
    "home.install": "Installer",
    "home.intro":
      "Rejouez à l’oreille des phrases de solos de jazz, dans tous les tons.",
    "home.rule.aria": "Déroulement du défi",
    "home.rule.phrases": "phrases",
    "home.rule.keysEach": "tons chacune",
    "home.rule.then": "puis",
    "home.rule.suddenDeath": "mort subite",
    "home.start": "Commencer",
    "home.resume": "Reprendre",
    "home.freeMode": "Mode libre",
    "home.favorites": "Mes phrases favorites",
    "home.restart": "Abandonner et recommencer",
    "developer.tools": "Outils développeur",
    "developer.mode": "Mode développeur",
    "developer.workshop": "Atelier",
    "developer.corpusRatings": "Corpus et notation",
    "developer.exportProtocol": "Exporter le protocole",
    "developer.exportData": "Exporter les données",
    "developer.realPhrase": "Phrase réelle",
    "developer.generatedPhrase": "Phrase générée",
    "developer.quickRating": "Notation rapide",
    "developer.threeStarReview": "Revue des phrases 3 étoiles",
    "developer.musiciansIncluded": "Musiciens inclus",
    "developer.classicJazz": "Jazz classique",
    "common.all": "Tous",
    "common.none": "Aucun",
    "developer.maxNotes": "Notes max",
    "developer.notes": "Notes",
    "developer.minimumRating": "Notation minimale",
    "developer.allPhrases": "Toutes les phrases",
    "developer.unratedPhrases": "Phrases non notées",
    "developer.twoStars": "2 étoiles ou plus",
    "developer.threeStars": "3 étoiles uniquement",
    "developer.calculatingCoverage": "Calcul de la couverture…",
    "developer.selectMusician": "Sélectionne au moins un musicien.",
    "favorites.back": "Retour",
    "favorites.kicker": "Mode libre",
    "favorites.title": "Mes phrases",
    "favorites.intro":
      "Choisis une phrase, puis explore-la librement dans les douze tons.",
    "favorites.empty.title": "Aucune phrase favorite",
    "favorites.empty.body":
      "Ajoute des favoris pendant un défi pour les retrouver ici.",
    "game.exitSession": "Quitter la session",
    "challenge.kicker": "Défi 3×3",
    "game.listenFind": "Écoute, puis retrouve la phrase",
    "favorites.add": "Ajouter aux favoris",
    "game.getReady": "Prépare-toi…",
    "rating.quick.aria": "Noter rapidement cette phrase",
    "rating.discard": "À écarter",
    "rating.keep": "À garder",
    "rating.recommend": "À proposer",
    "rating.checkpoint": "Point d’étape",
    "rating.undo": "Annuler la dernière note",
    "source.copy": "Copier",
    "source.source": "Source",
    "source.recording": "Enregistrement",
    "game.speed": "Vitesse",
    "game.playbackSpeed": "Vitesse de lecture",
    "game.replay": "Réécouter",
    "free.otherKey": "Autre ton",
    "common.next": "Suivant",
    "common.skip": "Passer",
    "phrase.length": "Longueur",
    "phrase.shortNotes": "Notes brèves",
    "phrase.lengthDecrease": "Réduire la longueur de la phrase",
    "phrase.lengthIncrease": "Augmenter la longueur de la phrase",
    "phrase.shortNotesDecrease": "Rétablir une note brève",
    "phrase.shortNotesIncrease": "Ignorer une note brève supplémentaire",
    "rating.aria": "Noter cette phrase",
    "rating.oneStar": "Noter 1 étoile",
    "rating.twoStars": "Noter 2 étoiles",
    "rating.threeStars": "Noter 3 étoiles",
    "game.listenOriginal": "Écouter l’original",
    "game.transpose": "Transposer",
    "ios.kicker": "Sur iPhone et iPad",
    "ios.title": "Installer l’app",
    "ios.stepSafari": "Ouvre cette page dans Safari.",
    "ios.stepShareBefore": "Touche le bouton",
    "ios.share": "Partager",
    "ios.stepShareAfter": ".",
    "ios.stepAddBefore": "Choisis",
    "ios.addToHome": "Ajouter à l’écran d’accueil",
    "ios.stepAddAfter": ".",
    "ios.done": "J’ai compris",
    "sudden.kicker": "Round final",
    "sudden.title": "Mort subite",
    "sudden.body":
      "Réécoute autant que nécessaire. Dès ta première note, tu n’as qu’une tentative. Une erreur, et la phrase reviendra plus tard dans un autre ton.",
    "sudden.ready": "Je suis prêt",
    "complete.kicker": "Session terminée",
    "complete.title": "Défi réussi",
    "complete.body":
      "Trois phrases ancrées, chacune retrouvée du premier coup.",
    "complete.new": "Nouveau défi",
    "complete.home": "Retour à l’accueil",
    "completion.kicker": "Phrase retrouvée",
    "completion.title": "Bien joué !",
    "completion.restart": "Recommencer",
    "completion.exit": "Quitter",
    "rotate.title": "Tourne l’appareil",
    "rotate.body": "Jazz Solo Challenge se joue en paysage.",
    "rotate.exit": "Quitter",
    "mode.generated": "Phrases générées",
    "mode.free": "Mode libre",
    "mode.suddenDeath": "Mort subite",
    "mode.challenge": "Défi 3×3",
    "mode.review": "Revue 3 étoiles",
    "game.explorePhrase": "Explore la phrase",
    "game.firstTry": "Du premier coup",
    "rating.listenRate": "Écoute, puis note la phrase",
    "review.listenAdjust": "Écoute, puis ajuste la phrase",
    "review.previous": "Phrase précédente",
    "review.next": "Phrase suivante",
    "review.progress": ({ current, total }) => `${current} sur ${total}`,
    "review.empty": "Il ne reste aucune phrase 3 étoiles à revoir.",
    "rating.setEnd": "Fin ici",
    "rating.setEndAria":
      "Définir la fin de la phrase à la position de lecture actuelle",
    "audio.stop": "Stop",
    "audio.listenOriginal": "Écouter l’original",
    "audio.listenCarefully": "Écoute bien…",
    "instrument.clarinet": "clarinette",
    "instrument.piano": "piano",
    "audio.loadingRecording": "Chargement de l’enregistrement…",
    "audio.transposingRecording": "Transposition de l’enregistrement…",
    "audio.recording": ({ transposition }) =>
      `Enregistrement original${transposition ? ` transposé ${transposition > 0 ? "+" : ""}${transposition}` : ""}…`,
    "audio.readError": "Impossible de lire cet enregistrement.",
    "audio.originalStopped": "Lecture originale arrêtée. À toi.",
    "rating.prompt": "Attribue 1, 2 ou 3 étoiles — touches 1, 2 ou 3.",
    "rating.adjustedPreview":
      "Enregistré. Écoute l’extrait ajusté, puis affine-le avec − / +.",
    "sudden.instructions":
      "Réécoute si nécessaire. Ta première note lancera l’unique tentative.",
    "game.findNote": ({ current, total }) =>
      `À toi — retrouve la note ${current} sur ${total}.`,
    "protocol.direct": ({ count }) =>
      `${count} ${plural(count, "note directe", "notes directes")}`,
    "protocol.covered": ({ covered, total }) =>
      `${covered} sur ${total} phrases couvertes`,
    "protocol.structuralExcluded": ({ count }) =>
      `${count} ${plural(count, "exclusion structurelle", "exclusions structurelles")}`,
    "protocol.globalDecisions": ({ count }) =>
      `${count} ${plural(count, "décision globale", "décisions globales")}`,
    "performers.selected": ({ selected, total, solos }) =>
      `${selected} sur ${total} · ${solos} solos`,
    "performers.optionTitle": ({ name, solos }) =>
      `${name} — ${solos} solo${solos > 1 ? "s" : ""}`,
    "session.training": ({ phrase, tone }) =>
      `Session en cours · phrase ${phrase} sur 3, ton ${tone} sur 3.`,
    "session.transition":
      "Les neuf manches sont terminées · mort subite à lancer.",
    "session.sudden": ({ count }) =>
      `Mort subite en cours · ${count} phrase${count > 1 ? "s" : ""} restante${count > 1 ? "s" : ""}.`,
    "favorites.removeSpecific": ({ performer, title }) =>
      `Retirer ${performer}, ${title} des favoris`,
    "favorites.remove": ({ subject = "" }) =>
      `Retirer${subject ? ` ${subject}` : ""} des favoris`,
    "favorites.addSubject": ({ subject = "" }) =>
      `Ajouter${subject ? ` ${subject}` : ""} aux favoris`,
    "challenge.progressPhrase": ({ current }) => `Phrase ${current} sur 3`,
    "challenge.progressTone": ({ current }) => `Ton ${current} sur 3`,
    "challenge.remaining": ({ count }) =>
      `${count} phrase${count > 1 ? "s" : ""} à valider`,
    "piano.range": ({ chunks, start, end }) =>
      `Piano de ${chunks} zones, du ${start} au ${end}`,
    "rating.sessionCount": ({ count }) =>
      `${count} phrase${count > 1 ? "s" : ""} notée${count > 1 ? "s" : ""}${count ? "" : " dans cette session"}`,
    "rating.sessionDistribution": ({ one, two, three }) =>
      `${one} / ${two} / ${three} en 1★ / 2★ / 3★`,
    "rating.coverage": ({ covered, total, percent }) =>
      `${covered} sur ${total} phrases couvertes (${percent} %)`,
    "rating.newGlobalDecisions": ({ count }) =>
      `${count} nouvelle${count > 1 ? "s" : ""} décision${count > 1 ? "s" : ""} globale${count > 1 ? "s" : ""}`,
    "rating.current": ({ rating }) =>
      `Note actuelle : ${rating} étoile${rating > 1 ? "s" : ""}`,
    "rating.unrated": "Phrase non notée",
    "rating.checkpointEntered": ({ count }) =>
      `Point d’étape : ${count} notes saisies.`,
    "rating.recorded": ({ rating }) =>
      `${rating} étoile${rating > 1 ? "s" : ""} enregistrée${rating > 1 ? "s" : ""}.`,
    "rating.undone": "Dernière note annulée.",
    "rating.allCovered":
      "Toutes les phrases sélectionnées sont couvertes par le protocole.",
    "phrase.unavailable": "Cette phrase est indisponible.",
    "phrase.noneAvailable": "Aucune phrase disponible.",
    "selection.real":
      "Sélectionne au moins un musicien pour les phrases réelles.",
    "source.originalKey": "tonalité originale",
    "source.transposition": ({ value }) =>
      `transposition ${value > 0 ? "+" : ""}${value} demi-tons`,
    "source.originalTempo": ({ tempo }) => `tempo original ${tempo} BPM`,
    "source.details": ({ label, details }) =>
      `Source : ${label}${details ? ` · ${details}` : ""}.`,
    "source.copyId": ({ id }) => `Copier l’identifiant ${id}`,
    "source.view": "Voir la source",
    "source.recordingLink": "Enregistrement source",
    "source.copied": "Copié",
    "source.copyFailed": "Échec",
    "source.generatedModel": ({ maxOrder, intervalCount, performerCount }) =>
      `Générée par Markov d’ordre variable (max. ${maxOrder}) sur ${formatNumberFor("fr", intervalCount)} intervalles de ${performerCount} soliste${performerCount > 1 ? "s" : ""}`,
    "source.transcription": ({
      performer,
      title,
      phrase,
      barStart,
      barEnd,
      noteCount,
      truncated,
    }) => {
      const bars =
        barStart === barEnd
          ? `mesure ${barStart}`
          : `mesures ${barStart}–${barEnd}`;
      const excerpt = truncated ? `, extrait de ${noteCount} notes` : "";
      return `${performer}, « ${title} », phrase ${phrase}, ${bars}${excerpt}`;
    },
    "playback.suddenLocked":
      "Tentative en cours — termine la phrase sans réécouter.",
    "playback.stopped": "Lecture arrêtée. Repars de la première note.",
    "playback.mistake": "Erreur — on réécoute depuis le début.",
    "playback.suddenFailed": "Raté — on passe à la phrase suivante.",
    "playback.interrupted": "Lecture interrompue. À toi.",
    "playback.attemptStarted": "Tentative lancée.",
    "playback.correct": ({ current, total }) =>
      `Juste. Note ${current} sur ${total}.`,
    "playback.progress": ({ current, total }) => `${current} sur ${total}.`,
    "finish.toneValidated": "Ton validé.",
    "finish.suddenValidated": "Phrase validée du premier coup.",
    "finish.free": "Phrase retrouvée. Rejoue-la ou change de ton.",
    "finish.phrase": "Phrase terminée.",
    "fullscreen.enter": "Plein écran",
    "fullscreen.exit": "Quitter le plein écran",
    "fullscreen.enterAria": "Passer en plein écran",
    "error.minimumChallenge":
      "Il faut au moins trois phrases 3★ pour créer un défi.",
    "error.repeatedKey":
      "Une tonalité ne peut pas être répétée dans un même cycle.",
    "error.exactChallenge":
      "Un défi doit contenir exactement trois phrases.",
    "error.distinctChallenge":
      "Les trois phrases du défi doivent être distinctes.",
    "error.phraseRequired":
      "Une phrase est nécessaire pour construire le clavier.",
    "error.selectMusician": "Sélectionne au moins un musicien.",
    "error.ratingFilter":
      "Aucune phrase ne correspond au filtre d’étoiles.",
    "error.registerTransition":
      "Aucune transition compatible avec le registre.",
    "error.filters": "Aucune phrase ne correspond aux filtres choisis.",
    "error.recordingUnavailable": ({ status }) =>
      `Enregistrement indisponible (${status})`,
    "error.bassSampleUnavailable": ({ status }) =>
      `Sample de basse indisponible (${status})`,
    "error.melodySampleUnavailable": ({ instrument, status }) =>
      `Sample de ${instrument} indisponible (${status})`,
  },
};

const noteNames = {
  en: ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"],
  fr: [
    "Do",
    "Do♯",
    "Ré",
    "Mi♭",
    "Mi",
    "Fa",
    "Fa♯",
    "Sol",
    "La♭",
    "La",
    "Si♭",
    "Si",
  ],
};

const errorKeys = {
  "Il faut au moins trois phrases 3★ pour créer un défi.":
    "error.minimumChallenge",
  "Une tonalité ne peut pas être répétée dans un même cycle.":
    "error.repeatedKey",
  "Un défi doit contenir exactement trois phrases.":
    "error.exactChallenge",
  "Les trois phrases du défi doivent être distinctes.":
    "error.distinctChallenge",
  "Une phrase est nécessaire pour construire le clavier.":
    "error.phraseRequired",
  "Sélectionne au moins un musicien.": "error.selectMusician",
  "Aucune phrase ne correspond au filtre d’étoiles.": "error.ratingFilter",
  "Aucune transition compatible avec le registre.":
    "error.registerTransition",
  "Aucune phrase ne correspond aux filtres choisis.": "error.filters",
};

export function resolveLocale(languages = null) {
  const candidates = Array.isArray(languages)
    ? languages
    : languages
      ? [languages]
      : [];
  const primary = String(candidates.find(Boolean) ?? "en").toLowerCase();
  return primary === "fr" || primary.startsWith("fr-") ? "fr" : "en";
}

const detectedLanguages =
  globalThis.__JAZZ_SOLO_LOCALE__ ??
  globalThis.navigator?.languages ??
  globalThis.navigator?.language ??
  "en";

export const locale = resolveLocale(detectedLanguages);

export function translateFor(targetLocale, key, variables = {}) {
  const selectedLocale = resolveLocale(targetLocale);
  const message = messages[selectedLocale][key] ?? messages.en[key];
  if (message === undefined) return key;
  return typeof message === "function" ? message(variables) : message;
}

export function t(key, variables = {}) {
  return translateFor(locale, key, variables);
}

export function hasTranslation(targetLocale, key) {
  return Object.hasOwn(messages[resolveLocale(targetLocale)], key);
}

export function translationKeys(targetLocale) {
  return Object.keys(messages[resolveLocale(targetLocale)]).sort();
}

export function noteName(pitchClass, targetLocale = locale) {
  const safePitchClass = ((Number(pitchClass) % 12) + 12) % 12;
  return noteNames[resolveLocale(targetLocale)][safePitchClass];
}

export function localizeError(message, targetLocale = locale) {
  const key = errorKeys[String(message)];
  return key ? translateFor(targetLocale, key) : String(message);
}

export function sourceLabel(source) {
  if (source?.kind === "generated") {
    return t("source.generatedModel", {
      maxOrder: source.maxOrder,
      intervalCount: source.intervalSampleSize,
      performerCount: source.performers?.length ?? 0,
    });
  }
  if (source?.kind === "transcription") {
    return t("source.transcription", {
      performer: source.performer,
      title: source.title,
      phrase: source.phrase,
      barStart: source.barStart,
      barEnd: source.barEnd,
      noteCount: source.noteCount,
      truncated: source.truncated,
    });
  }
  return source?.label ?? "";
}

export function applyDocumentTranslations(root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  root.documentElement?.setAttribute("lang", locale);

  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of root.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  }
  for (const element of root.querySelectorAll("[data-i18n-title]")) {
    element.setAttribute("title", t(element.dataset.i18nTitle));
  }

  const description = root.querySelector('meta[name="description"]');
  if (description) description.content = t("meta.description");
  const manifest = root.querySelector('link[rel="manifest"]');
  if (manifest) {
    manifest.href =
      locale === "fr" ? "./manifest-fr.webmanifest" : "./manifest.webmanifest";
  }
}
