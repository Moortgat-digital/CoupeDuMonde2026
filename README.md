# Pronostics Coupe du Monde 2026

Prototype interne sans authentification participant, avec données partagées via Vercel Blob.

## Lancer

Installer les dépendances :

```bash
npm install
```

Lancer en local avec les fonctions Vercel :

```bash
vercel dev
```

L'interface admin est séparée dans `admin/index.html`. Une fois hébergée avec un serveur statique, elle pourra être exposée via `/admin`.

## Variables Vercel

Créer un store Vercel Blob puis ajouter les variables au projet :

- `BLOB_READ_WRITE_TOKEN` : fourni par Vercel Blob ;
- `ADMIN_SECRET` : code secret utilisé sur `/admin`.

## Ce qui est inclus

- sélection d'un profil participant ;
- saisie d'un vainqueur final avant le début du tournoi ;
- saisie des scores jusqu'au coup d'envoi ;
- classement général automatique ;
- écran admin séparé pour renseigner les résultats ;
- paramétrage des affiches de phase finale ;
- barème ajusté pour la Coupe du Monde 2026.

Le calendrier, les équipes et le barème de progression sont centralisés dans `data.js`.
