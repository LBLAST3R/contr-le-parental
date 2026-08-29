# Déployer sur Hostinger via GitHub

Objectif : l'app tourne sur Hostinger en HTTPS, se met à jour automatiquement à
chaque `git push`, et seuls les parents y accèdent (mot de passe `James85*`, une
seule fois par appareil).

> Il te faut un plan Hostinger qui supporte **Node.js** (hébergement web
> Business/Cloud avec Node, ou un VPS Hostinger). Node 18+.

## 1. Envoyer le code sur GitHub

Le dépôt visé : `LBLAST3R/contr-le-parental` (garde-le **privé**).

```bash
git add .
git commit -m "Guardian - app parents"
git push -u origin main
```

Le `.env` et `data/` ne sont PAS envoyés (voir `.gitignore`) : les secrets
restent hors du dépôt.

## 2. Créer l'application Node.js sur Hostinger

Dans **hPanel** :

1. **Sites web → (ton domaine) → Node.js** (ou *Avancé → Node.js*).
2. Crée une application :
   - **Version de Node** : 18 ou plus.
   - **Dossier racine (application root)** : la racine du dépôt.
   - **Fichier de démarrage (startup file)** : `server.js`
   - **Commande d'install** : `npm install` (Hostinger la lance).
3. **Source GitHub** : connecte ton compte GitHub et choisis le dépôt
   `LBLAST3R/contr-le-parental`, branche `main`.
   - Active **le déploiement automatique** (auto-deploy on push) si l'option est
     proposée : chaque `git push` redéploiera l'app.

> Hostinger fournit lui-même le `PORT` ; l'app l'utilise via `process.env.PORT`.

## 3. Variables d'environnement (dans hPanel, PAS dans Git)

Dans la configuration de l'app Node.js, ajoute :

| Nom | Valeur |
|---|---|
| `PARENT_PASSWORD` | `James85*` |
| `SESSION_SECRET` | une longue valeur aléatoire (voir ci-dessous) |
| `AGENT_API_KEY` | la même clé que dans la config de l'agent du PC |
| `HEARTBEAT_TIMEOUT_SECONDS` | `600` |
| (option) `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHATS` | pour les alertes |

Générer `SESSION_SECRET` et `AGENT_API_KEY` :

```bash
node -e "console.log('SESSION_SECRET =', require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('AGENT_API_KEY  =', require('crypto').randomBytes(24).toString('base64url'))"
```

Puis **redémarre** l'application dans hPanel pour charger les variables.

## 4. HTTPS

Active le **certificat SSL** du domaine dans hPanel (gratuit chez Hostinger) et
force la redirection HTTPS. Indispensable : le cookie de session est marqué
`Secure`.

## 5. Vérifier

- Ouvre `https://tondomaine/api/health` → `{"ok":true,...}`.
- Ouvre `https://tondomaine/` → page de connexion → mot de passe `James85*` →
  tableau de bord. Recharge : plus besoin de retaper le mot de passe.

## 6. Relier l'agent du PC de James

Dans la config de l'agent (`config.json` sur le PC, ou `-ServerUrl`/`-ApiKey`
à l'installation) :

- `server_url` = `https://tondomaine`
- `api_key` = la valeur de `AGENT_API_KEY` (identique côté serveur)

L'appareil doit apparaître **en ligne** dans le tableau de bord en < 1 min.

## 7. Mettre à jour l'app plus tard

Modifie le code, puis :

```bash
git commit -am "mise à jour"
git push
```

Avec l'auto-déploiement activé, Hostinger redéploie tout seul. (Sans
auto-déploiement, clique **Deploy** / **Pull** dans hPanel.)

## Alternative : VPS Hostinger (Docker)

Si tu es sur un VPS, tu peux aussi cloner le dépôt et lancer avec **PM2** :

```bash
git clone https://github.com/LBLAST3R/contr-le-parental.git
cd contr-le-parental && npm install
cp .env.example .env   # remplir
npm i -g pm2 && pm2 start server.js --name guardian && pm2 save
```

Mets un reverse proxy HTTPS (Nginx/Caddy) devant le port de l'app.

## Sauvegardes

Les données vivent dans `data/db.json` (et `data/updates/`). Sauvegarde ce
dossier régulièrement — il n'est pas dans Git.
