# Volailles de l'Est — Point Journalier & Tableau de bord

Digitalisation de la fiche de suivi quotidien des fermes avicoles (pondeuses et chair), Agnibilékrou, Côte d'Ivoire. Cf. `docs/` pour la note de conception et le cahier des charges technique complets.

## Structure

- `backend/` — API Django + Django REST Framework (modèles Magasin/Ferme/Bande/PointJournalier, calculs métier, admin).
- `frontend/` — PWA React (Vite), deux écrans : saisie terrain (Point Journalier) et tableau de bord consolidé.

## Démarrer le backend

```
cd backend
python -m venv venv
venv\Scripts\activate          # ou source venv/Scripts/activate sous Git Bash
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_donnees_reelles   # charge l'état réel des 7 fermes
python manage.py createsuperuser
python manage.py runserver 8010
```

## Démarrer le frontend

```
cd frontend
npm install
npm run dev -- --port 5173
```

Ouvrir http://localhost:5173, se connecter avec le compte créé côté backend.

## Structure des fermes (état au 24/07/2026)

7 entrées : Ayénou 1, Ayénou 1.3 (bande transférée, magasin partagé avec Ayénou 1), Ayénou 2, Presso — actives ; Ayénou 3, Koffikro, Assuamé — vides (aucune bande active).

## Identité de marque

Logo réel intégré (`frontend/assets/logo/`, icônes PWA/favicon générées à partir de celui-ci).

## Hors-ligne

Le Point Journalier fonctionne hors-ligne : les saisies sans réseau sont mises en file d'attente locale (IndexedDB, `frontend/src/offline/`) et synchronisées automatiquement au retour de la connexion. La Facturation reste en ligne uniquement (vérifications de stock en temps réel).

## Déploiement (production)

Le backend lit sa config via variables d'environnement (défauts adaptés au développement local) :

- `DJANGO_SECRET_KEY` — clé secrète Django (obligatoire en prod).
- `DJANGO_DEBUG` — `False` en production (défaut `True`).
- `DJANGO_ALLOWED_HOSTS` — domaines autorisés, séparés par des virgules (ex. `vde-backend.onrender.com`).
- `DJANGO_CORS_ALLOWED_ORIGINS` — origines frontend autorisées, séparées par des virgules (ex. `https://volailles-de-lest.netlify.app`).
- `DJANGO_CSRF_TRUSTED_ORIGINS` — mêmes origines que ci-dessus, avec le schéma `https://` (nécessaire pour la connexion à l'admin Django).
- `DATABASE_URL` — chaîne de connexion Postgres (ex. Neon, Supabase) ; à défaut, SQLite local (non adapté à un hébergeur au disque éphémère comme le plan gratuit Render).

Commandes de build/démarrage (ex. Render) :
- Build : `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`
- Start : `gunicorn vde_backend.wsgi:application`

Le frontend lit l'URL de l'API via `VITE_API_BASE_URL` (ex. `https://vde-backend.onrender.com/api`) au moment du build (`npm run build`).
