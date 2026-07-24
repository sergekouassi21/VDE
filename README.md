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
pip install django djangorestframework django-cors-headers python-decouple
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

Logo réel de l'entreprise à intégrer dans `assets/logo/` (icônes PWA actuellement provisoires, à remplacer une fois le fichier fourni).

## Prochaines étapes

Cf. cahier des charges technique : déploiement pilote sur Ayénou 1, puis généralisation. Fonctionnement hors-ligne (service worker + file d'attente IndexedDB) à implémenter — la base PWA est en place via `vite-plugin-pwa` mais la synchronisation différée reste à construire.
