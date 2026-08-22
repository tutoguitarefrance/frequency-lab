# Oscillostudio — v7.9

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
- Fondamentale + octaves supérieures et inférieures uniquement.
- Réglage fin ±100 cents.

## GitHub Pages

Déposer à la racine du dépôt :

- `index.html`
- `styles.css`
- `app.js`
- `audio-engine.js`
- `.nojekyll` (optionnel)

Puis **Settings → Pages → Deploy from a branch → main → /(root)**.

## v7.6 — transport, phase et harmoniques
- Sur smartphone, le bouton PLAY/STOP se place entre les deux cadrans.
- PLAY devient STOP rouge pendant la lecture ; le bouton STOP normal séparé est supprimé.
- Un STOP d’urgence permanent est placé dans un coin et coupe immédiatement les oscillateurs.
- Ajout d’une inversion globale de phase/polarité 0° / 180°.
- La prévisualisation de forme d’onde s’inverse également.
- Impossible de couper la fondamentale si SUR et SUB sont tous deux à 0 % : message bref et retour automatique sur ON.
- Si les harmoniques repassent tous à 0 % avec la fondamentale coupée, celle-ci est réactivée automatiquement.
- Les sur- et subharmoniques héritent maintenant du morphing de forme d’onde ; le cadran reste donc audible même fondamentale coupée.


## v7.7 — octaves uniquement
- Suppression de la série harmonique classique `2f, 3f, 4f, 5f...` et de la série inverse `f/2, f/3, f/4...`.
- **OCTAVES +** génère uniquement `f×2, f×4, f×8, f×16...`.
- **OCTAVES −** génère uniquement `f÷2, f÷4, f÷8, f÷16...`.
- Exemple à 440 Hz : + = 880, 1760, 3520, 7040, 14080 Hz ; − = 220, 110, 55, 27,5, 13,75 Hz...
- Les octaves entrent progressivement avec les curseurs de richesse.
- Les composantes hors Nyquist restent automatiquement ignorées par le moteur audio.
- Les octaves héritent toujours du morphing de forme d’onde et de l’inversion de phase.
- Cache-busting mis à jour en `?v=7.7`.

## v7.8 — recalibrage de sortie
- Correction additive par défaut : **−0,05 Hz** sur chaque fréquence réellement générée.
- La correction est appliquée après le ratio d’octave : 440 nominal -> 439,95 généré ; 880 nominal -> 879,95 généré.
- Le cadran et l’affichage conservent la fréquence nominale demandée (440, 880, etc.).
- Calibration réglable de −2,00 à +2,00 Hz et désactivable avec 0,00 Hz.


## v7.9 — transport mobile
- PLAY/STOP mobile dédié, physiquement placé entre les deux cadrans dès qu’ils sont empilés (≤ 980 px).
- Aucun déplacement du bouton par JavaScript.
- Le bouton desktop est masqué dans cette disposition.
- Aucun second STOP normal : PLAY devient STOP pendant l’émission.
- Le seul autre arrêt est `STOP URGENCE`, fixé dans un coin pour une coupure immédiate.
