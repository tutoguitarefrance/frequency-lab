# Oscillostudio — v7

Générateur de fréquences autonome en Web Audio API, conçu pour les tests audio et une intégration ultérieure comme module de Tinnitune.

## v7 — séparation des commandes

- Deux cadrans totalement indépendants : **Fréquence** et **Forme d’onde**.
- Les gestes du cadran Fréquence ne peuvent plus modifier la forme d’onde, et inversement.
- Sur mobile, le cadran Fréquence utilise une rotation **relative** pour éviter les sauts brutaux.
- Pression longue sur la fréquence centrale : ouverture du clavier numérique.
- Le cadran Forme d’onde conserve les quatre formes en néon permanent.
- Le morphing est montré par un **large ruban lumineux flou** sur la couronne, pas par un simple halo ponctuel.
- La couleur du ruban évolue fortement et continûment entre cyan, vert, magenta et orange.
- Le centre du cadran Forme d’onde affiche la forme réellement interpolée.
- En lecture, le centre du cadran Fréquence devient un oscilloscope du signal réel.

## GitHub Pages

Déposer à la racine du dépôt :

- `index.html`
- `styles.css`
- `app.js`
- `audio-engine.js`
- `.nojekyll` (optionnel mais recommandé)

Puis activer **Settings → Pages → Deploy from a branch → main → /(root)**.


## v7.1
- Suppression du fond noir des cadres derrière les formes d’onde.
- Les repères restent lumineux avec fond transparent.


## v7.2
- Suppression complète des cadres rectangulaires autour des formes d’onde.
- Les formes d’onde restent seules, flottantes et lumineuses sur le cadran.


## v7.3
- Correction de l’échelle du cadran de fréquence.
- Le curseur et la zone colorée sont désormais alignés sur les repères 20 / 100 / 440 / 1k / 5k / 10k / 20k / 25k.
- Interpolation logarithmique entre chaque repère.


## v7.4 — recalibrage du cadran de fréquence
- Échelle complète de 0 à 25 000 Hz.
- Ajout des repères 0 Hz et 10 Hz.
- Une seule table de calibration pilote les repères, le curseur, la zone colorée et le clic.
- 0–10 Hz est interpolé linéairement ; les intervalles positifs sont logarithmiques.
- 7,131 Hz se place entre 0 et 10 Hz ; 7 131 Hz entre 5 kHz et 10 kHz.
- Cache-busting `?v=7.4` ajouté aux CSS/JS pour éviter le cache Firefox/GitHub Pages.
