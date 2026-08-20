"""
URL configuration for vde_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from exploitation.mot_de_passe import mot_de_passe_oublie, reinitialiser_mot_de_passe
from exploitation.deux_facteurs import (
    connexion,
    deconnexion,
    deux_facteurs_confirmer,
    deux_facteurs_configurer,
    deux_facteurs_desactiver,
    deux_facteurs_statut,
)

urlpatterns = [
    # Chemin secret (cf. settings.ADMIN_PATH) : un bot qui tape /admin/ tombe
    # sur un 404. Le vrai chemin n'est livré qu'à la Direction via /api/moi/.
    path(f'{settings.ADMIN_PATH}/', admin.site.urls),
    path('api/auth/login/', connexion, name='api-login'),
    path('api/auth/logout/', deconnexion, name='api-logout'),
    path('api/auth/mot-de-passe-oublie/', mot_de_passe_oublie, name='api-mot-de-passe-oublie'),
    path('api/auth/reinitialiser/', reinitialiser_mot_de_passe, name='api-reinitialiser'),
    path('api/auth/2fa/statut/', deux_facteurs_statut, name='api-2fa-statut'),
    path('api/auth/2fa/configurer/', deux_facteurs_configurer, name='api-2fa-configurer'),
    path('api/auth/2fa/confirmer/', deux_facteurs_confirmer, name='api-2fa-confirmer'),
    path('api/auth/2fa/desactiver/', deux_facteurs_desactiver, name='api-2fa-desactiver'),
    path('api/', include('exploitation.urls')),
    path('api/pointage/', include('pointage.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
