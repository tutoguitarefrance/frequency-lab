# Frequency Lab

Générateur de fréquences autonome conçu pour :

- tester l'accordeur **NaturTune** ;
- servir plus tard de module audio dans **Tinnitune** ;
- fonctionner directement dans un navigateur mobile ou desktop via **GitHub Pages**.

## Fonctions

- fréquence de 0 à 25 000 Hz ;
- réglage fin de -100 à +100 cents ;
- sinusoïde, triangle, carrée et dent de scie ;
- ajout de sur-harmoniques ;
- ajout de sub-harmoniques ;
- niveau indépendant de chaque composante ;
- normalisation du mélange ;
- affichage du sample rate réel et de la limite de Nyquist ;
- coupure des composantes qui dépassent Nyquist pour éviter un faux signal par aliasing ;
- interface responsive pour smartphone.

## Publication sur GitHub Pages

### Méthode simple depuis github.com

1. Créer un nouveau dépôt GitHub, par exemple `frequency-lab`.
2. Déposer **tout le contenu de ce dossier à la racine du dépôt** :
   - `index.html`
   - `styles.css`
   - `app.js`
   - `audio-engine.js`
   - `.nojekyll`
   - `README.md`
3. Ouvrir **Settings > Pages** dans le dépôt.
4. Dans **Build and deployment**, choisir **Deploy from a branch**.
5. Choisir la branche **main** et le dossier **/(root)**.
6. Enregistrer.

L'application sera ensuite accessible à une adresse du type :

`https://UTILISATEUR.github.io/frequency-lab/`

## Test sur smartphone

Ouvrir l'adresse GitHub Pages dans Firefox, Chrome ou Safari puis toucher **Émettre le son**. Le premier démarrage audio doit être déclenché par une action de l'utilisateur : c'est une contrainte normale des navigateurs mobiles.

Pour tester NaturTune, commencer avec une sinusoïde à 440 Hz et utiliser le réglage en cents :

- -50 cents
- -25 cents
- -10 cents
- 0 cent
- +10 cents
- +25 cents
- +50 cents

## Limites physiques

L'interface accepte jusqu'à 25 000 Hz, mais la sortie réelle dépend du sample rate accordé par le navigateur, du DAC, de l'amplificateur et du haut-parleur du téléphone.

Le moteur demande un AudioContext à 96 kHz lorsque le navigateur l'accepte. Si le contexte reste à 48 kHz, la limite de Nyquist est 24 kHz : une composante de 25 kHz est alors volontairement coupée plutôt que reproduite sous une fréquence erronée.

0 Hz correspond à une composante continue et non à une fréquence audible.

## Architecture

- `audio-engine.js` : moteur audio réutilisable dans Tinnitune ;
- `app.js` : logique de l'interface de test ;
- `styles.css` : présentation responsive ;
- `index.html` : interface.

Le moteur audio est volontairement séparé de l'interface afin de pouvoir être repris plus tard dans Tinnitune.
