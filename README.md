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
