# Frequency Lab

Générateur de fréquences Web Audio autonome conçu pour tester l'accordeur Oscillostudio et servir ensuite de module intégrable dans Tinnitune.

## Interface v2

- Molette circulaire de fréquence 0–25 000 Hz.
- La molette devient un oscilloscope en lecture tout en restant réglable au toucher.
- Couronne métallique de sélection de forme d'onde : sinusoïde, triangle, carrée, dent de scie.
- Richesse des sur-harmoniques par curseur vertical vers le haut.
- Richesse des subharmoniques par curseur vertical vers le bas.
- Fondamentale activable/désactivable.
- Réglage fin ±100 cents pour tester Oscillostudio.
- Analyse du sample rate réel et coupure des composantes au-dessus de Nyquist pour éviter l'aliasing.

## Commandes de la molette

- Toucher / cliquer autour de la molette : changement direct de fréquence.
- Glisser autour du cadran : réglage continu.
- Molette de souris : réglage fin relatif.
- Shift + molette : réglage très fin.
- Saisie numérique centrale : valeur exacte en Hz.

La loi de la molette est logarithmique afin de conserver une bonne précision dans les fréquences musicales tout en couvrant 0–25 kHz.

## GitHub Pages

Déposer les fichiers à la racine d'un dépôt puis activer :

Settings → Pages → Deploy from a branch → main → /(root)

Aucune dépendance externe.


## Version 3

- Morphing continu entre sinusoïde, triangle, carrée et dent de scie en glissant sur la couronne.
- Le réglage fin ±100 cents modifie réellement la fréquence émise et la valeur centrale suit le signal.
- La valeur de fréquence reste centrée dans le cadran.

## v4 — morphing réellement continu

La couronne de forme d’onde est désormais une commande analogique continue. Les quatre pictogrammes (sinus, triangle, carrée, dent de scie) ne sont plus des boutons. En glissant sur la couronne, le moteur effectue un crossfade continu entre les deux formes voisines, avec affichage en pourcentage (par ex. « SINUSOÏDE 63 % • TRIANGLE 37 % »). Les gains des oscillateurs restent lissés pendant le déplacement pour éviter les sauts audibles.

## v5 — contrôle mobile

- Un simple contact sur la molette tactile ne provoque plus de saut de fréquence.
- Sur smartphone/tablette, la molette fonctionne en **variation relative** : tourner le doigt augmente ou diminue progressivement la fréquence à partir de la valeur actuelle.
- **Pression longue (~0,5 s) sur la fréquence centrale puis relâcher** : activation de la saisie et ouverture du clavier numérique mobile.
- Après validation/fermeture du clavier, la valeur est appliquée et la zone redevient protégée contre les taps accidentels.
- Les contrôles souris/clavier de bureau restent disponibles.


## v6 — couronne chromatique intuitive

- Les quatre formes d’onde restent visibles en permanence avec un code couleur néon fixe : sinus cyan, triangle vert, carrée magenta, dent de scie orange.
- Un large halo flou suit la position du morphing sur la couronne.
- La couleur du halo se transforme continuellement entre les deux formes voisines ; le changement est donc visible même sans lire les pourcentages.
- Une carte chromatique discrète reste présente sur la couronne métallique pour indiquer le sens des quatre zones.
- Le repère précis et le libellé sous le cadran reprennent la couleur courante du halo.
