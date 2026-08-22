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
