# Oscillostudio — v7.5

Générateur de fréquences autonome en Web Audio API, conçu pour les tests audio et une intégration ultérieure comme module de Tinnitune.

## v7.5 — cadran fréquence unifié

- Correction structurelle du calibrage visuel du cadran de fréquence.
- Les repères, l’arc coloré et le curseur utilisent désormais **le même SVG et la même fonction de coordonnées**.
- Suppression du mélange précédent entre positions HTML, rotation CSS et gradient conique.
- Échelle : **0 / 10 / 20 / 100 / 440 / 1k / 5k / 10k / 20k / 25k**.
- `7,131 Hz` se place entre `0` et `10`; `7 131 Hz` entre `5k` et `10k`.
- Badge **v7.5** visible dans l’interface pour contrôler immédiatement la version déployée.
- Cache-busting `?v=7.5` sur CSS et JavaScript.

## Fonctions principales

- Deux cadrans indépendants : **Fréquence** et **Forme d’onde**.
- Saisie exacte de fréquence par pression longue sur mobile.
- Morphing continu sinusoïde / triangle / carrée / dent de scie.
- Oscilloscope pendant la lecture.
- Fondamentale, sur-harmoniques et subharmoniques.
- Réglage fin ±100 cents.

## GitHub Pages

Déposer à la racine du dépôt :

- `index.html`
- `styles.css`
- `app.js`
- `audio-engine.js`
- `.nojekyll` (optionnel)

Puis **Settings → Pages → Deploy from a branch → main → /(root)**.
