# Cahier de mathématiques — Guide de déploiement

App de pratique de mathématiques inspirée de Kumon, pour Liam, Camila et un invité optionnel.

## Aperçu

- 14 niveaux (additions → soustractions → multiplications), avec paquets de drill
- 3 modes d'entrée : pavé numérique, crayon Apple, crayon manuel
- Portail parent avec contrôle des niveaux, temps détaillé, correction manuelle
- PWA : s'installe sur l'iPad comme une vraie app
- Données stockées localement sur chaque appareil (rien n'est envoyé sur internet)

---

## 🚀 Déploiement gratuit sur Vercel (~10 minutes)

Tu vas avoir une vraie URL `https://...vercel.app` que tu pourras installer sur chaque iPad.

### Étape 1 : créer un compte GitHub (si tu n'en as pas)

1. Va sur https://github.com et clique **Sign up**
2. Choisis un nom d'utilisateur, un email, un mot de passe
3. Confirme ton email

### Étape 2 : créer un nouveau dépôt GitHub

1. Connecté sur GitHub, clique le **+** en haut à droite → **New repository**
2. Nom du dépôt : `cahier-mathematiques` (ou ce que tu veux)
3. Laisse en **Public** (Vercel gratuit nécessite public, sauf si tu paies)
4. Ne coche RIEN d'autre (pas de README, pas de .gitignore — on a déjà tout)
5. Clique **Create repository**

### Étape 3 : envoyer le code sur GitHub

**Option A — Glisser-déposer dans le navigateur (le plus simple) :**

1. Sur la page de ton nouveau dépôt vide, clique **uploading an existing file**
2. **Décompresse** le fichier `cahier-app.zip` que je t'ai donné
3. **Sélectionne tous les fichiers/dossiers à l'intérieur** (PAS le dossier `cahier-app` lui-même, mais son contenu : `src/`, `public/`, `package.json`, etc.)
4. Glisse-les dans la zone de dépôt GitHub
5. En bas, écris un message comme `Initial commit` puis clique **Commit changes**

**Option B — Avec la ligne de commande (si tu connais git) :**

```bash
cd cahier-app
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TON_NOM/cahier-mathematiques.git
git push -u origin main
```

### Étape 4 : déployer sur Vercel

1. Va sur https://vercel.com et clique **Sign up**
2. Choisis **Continue with GitHub** (le plus rapide)
3. Autorise Vercel à accéder à ton compte GitHub
4. Une fois connecté, clique **Add New...** → **Project**
5. Trouve `cahier-mathematiques` dans la liste et clique **Import**
6. Sur la page de configuration :
   - **Framework Preset** : Vite (devrait être détecté automatiquement)
   - **Build Command** : `npm run build` (auto-rempli)
   - **Output Directory** : `dist` (auto-rempli)
   - **Install Command** : `npm install` (auto-rempli)
   - Laisse tout par défaut
7. Clique **Deploy**
8. Attends ~1-2 minutes que Vercel compile et déploie
9. Tu obtiens une URL du genre `https://cahier-mathematiques-xxxx.vercel.app`

### Étape 5 : installer l'app sur les iPads

#### iPad de Liam

1. Ouvre Safari sur l'iPad de Liam
2. Va à `https://cahier-mathematiques-xxxx.vercel.app/?kid=k1`
3. Appuie sur le bouton **Partager** (carré avec flèche vers le haut)
4. Fais défiler et choisis **Sur l'écran d'accueil**
5. Renomme « Liam » si tu veux, puis appuie **Ajouter**
6. L'icône apparaît sur l'écran d'accueil de Liam comme une vraie app

#### iPad de Camila

Pareil, mais avec l'URL `?kid=k2` : `https://cahier-mathematiques-xxxx.vercel.app/?kid=k2`

### Étape 6 : configuration finale

Au premier lancement, va dans **Accès parent** (NIP par défaut : `1234`) → **Réglages** et :

- Change les NIP des enfants si tu veux
- Change ton NIP parent
- Mets ton courriel pour recevoir les rapports
- Confirme les noms/âges/couleurs

---

## 💡 Avoir un nom de domaine personnalisé (optionnel)

Si tu veux `cahier.tonnom.com` au lieu de `cahier-mathematiques-xxxx.vercel.app` :

1. Achète un domaine (Namecheap, Cloudflare Registrar, OVH...) — ~15$/an
2. Dans Vercel → ton projet → **Settings** → **Domains** → **Add**
3. Suis les instructions DNS

Pas nécessaire — l'URL vercel.app fonctionne parfaitement.

---

## 🔄 Mettre à jour l'app plus tard

Si je te donne une nouvelle version :
1. Glisse les fichiers modifiés dans ton dépôt GitHub (overwrite)
2. Vercel détecte automatiquement et redéploie en ~1 minute
3. Les iPads des enfants reçoivent la mise à jour au prochain lancement

---

## ⚠️ Important sur les données

- Les données sont stockées **localement sur chaque iPad** (localStorage du navigateur)
- Liam et Camila auront **chacun leurs propres données** car ils utilisent des iPads différents
- Si tu effaces les données du navigateur sur un iPad, tu perds la progression de cet enfant
- Il n'y a pas de synchronisation entre iPads — c'est voulu pour la simplicité et la vie privée

---

## 🛠 Tester localement avant de déployer (optionnel)

Si tu veux essayer sur ton PC avant de déployer :

```bash
cd cahier-app
npm install
npm run dev
```

Puis ouvre `http://localhost:5173` dans ton navigateur.

Pour tester le PWA build :
```bash
npm run build
npm run preview
```

---

## ❓ Problèmes courants

**« npm install » ne fonctionne pas**
- Installe Node.js : https://nodejs.org (prends la version LTS)
- Redémarre ton terminal après l'installation

**Vercel donne une erreur de build**
- Vérifie que tu as bien envoyé TOUS les fichiers du zip
- Vérifie qu'il y a bien `package.json` à la racine du dépôt GitHub

**L'app ne s'installe pas comme PWA sur l'iPad**
- Utilise Safari (pas Chrome) sur iPad
- L'URL doit être en HTTPS (Vercel le fait automatiquement)
- Force le rafraîchissement : appuie longtemps sur le bouton recharger

**Les enfants se voient mutuellement dans leurs profils**
- Vérifie que tu utilises bien les URLs `?kid=k1` et `?kid=k2`
- OU active le verrouillage par appareil dans Accès parent → Réglages

---

Bonne pratique à Liam et Camila ! 🎯
