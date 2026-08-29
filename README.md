# Guardian — tableau de bord parental (app Node)

Application web que **les parents** utilisent pour surveiller et protéger
l'ordinateur de James, à distance. Elle reçoit les remontées de l'agent Guardian
installé sur le PC, affiche l'activité et les alertes, et permet d'agir
(accorder du temps, message à l'écran, **verrouillage d'urgence**…).

Conçue pour être **déployée sur Hostinger via GitHub**. Aucune dépendance
native (stockage JSON), donc `npm install` suffit.

## Sécurité d'accès

- **Un seul mot de passe** pour les parents (`PARENT_PASSWORD`). À la première
  connexion, un **cookie de session signé** (httpOnly, `SameSite=Lax`, `Secure`
  en HTTPS) est posé pour ~90 jours : **ils ne retapent pas le mot de passe** à
  chaque visite.
- Mot de passe jamais stocké en clair (hash scrypt en mémoire), jamais commité
  (il vit dans les variables d'environnement / `.env` non versionné).
- **Anti-force brute** : au-delà de 10 essais / 15 min par IP, la connexion est
  bloquée temporairement.
- L'**agent** s'authentifie séparément par clé d'API (`AGENT_API_KEY`).
- Entêtes de sécurité (CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`).

> ⚠️ Sers TOUJOURS l'app en **HTTPS** (Hostinger fournit le certificat). Le
> cookie de session ne doit transiter qu'en HTTPS.

## Fonctionnalités

- Vue d'ensemble des appareils (en ligne, temps d'écran, app au 1er plan).
- Flux d'alertes (paiement, manipulation, contournement…) filtrable.
- Détail par appareil : historique 7 jours, top applications.
- Actions : accorder du temps, message à l'écran, **verrouiller entièrement le
  PC / le rouvrir / l'éteindre** à distance.
- Mises à jour de l'agent : publication d'une version, l'agent la tire et
  l'applique (vérif SHA-256).
- Alertes Telegram temps réel en option (avec boutons Autoriser/Refuser).

## Variables d'environnement

Voir [`.env.example`](.env.example). Les essentielles :

| Variable | Rôle |
|---|---|
| `PARENT_PASSWORD` | mot de passe des parents (ex. `James85*`) |
| `SESSION_SECRET` | secret de signature des cookies (long, aléatoire) |
| `AGENT_API_KEY` | clé partagée avec l'agent du PC |
| `PORT` | fourni par Hostinger ; 3000 en local |
| `TELEGRAM_*` | facultatif (alertes temps réel) |

## Lancer en local

```bash
cp .env.example .env      # puis renseigne PARENT_PASSWORD, AGENT_API_KEY, SESSION_SECRET
npm install
npm start                 # http://localhost:3000/login
```

## Déploiement

Voir **[DEPLOY-HOSTINGER.md](DEPLOY-HOSTINGER.md)** : dépôt GitHub → app Node.js
Hostinger → variables d'environnement → auto-déploiement à chaque `git push`.

## Contrat d'API (pour l'agent)

Endpoints attendus par l'agent Python (inchangés) :
`POST /api/ingest/heartbeat`, `POST /api/ingest/event`,
`GET /api/ingest/commands`, `GET /api/ingest/update`,
`GET /api/ingest/update/download` — tous avec l'entête `X-API-Key`.

Les données sont stockées dans `data/` (JSON), ignoré par Git.
