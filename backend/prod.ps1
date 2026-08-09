# Lance une commande Django sur la base de PRODUCTION.
#
#   .\prod.ps1 sauvegarde
#   .\prod.ps1 migrate
#   .\prod.ps1 diagnostic_email --compte serge
#
# Pourquoi ce script existe : jusqu'ici il fallait taper
# `$env:DATABASE_URL = "postgresql://...mot_de_passe..."` dans le terminal
# avant chaque commande. Le secret se retrouvait donc dans l'historique
# PowerShell, et surtout dans tout copier-coller de la session — c'est ainsi
# que deux mots de passe de production ont fui le 07/08/2026.
#
# Ici, l'URL vit dans .env.prod (ignoré par git, jamais affiché). Le terminal
# ne montre plus que le nom de la commande et son résultat : on peut copier
# toute la fenêtre sans rien divulguer.
#
# Créer le fichier une fois, avec la valeur prise sur Render :
#
#   DATABASE_URL=postgresql://...
#
# Et le protéger, puisqu'il contient désormais la clé du royaume :
#
#   icacls .env.prod /inheritance:r /grant:r "$env:USERNAME:(R,W)"

$ErrorActionPreference = "Stop"
$racine = $PSScriptRoot
$fichier = Join-Path $racine ".env.prod"

if (-not (Test-Path $fichier)) {
    Write-Host "Fichier introuvable : $fichier" -ForegroundColor Red
    Write-Host ""
    Write-Host "Creez-le avec une seule ligne, la valeur venant de Render > Environment :"
    Write-Host "  DATABASE_URL=postgresql://..."
    exit 1
}

if ($args.Count -eq 0) {
    Write-Host "Usage : .\prod.ps1 <commande Django> [options]" -ForegroundColor Yellow
    Write-Host "Exemples : .\prod.ps1 sauvegarde   |   .\prod.ps1 migrate"
    exit 1
}

# Lecture ligne à ligne plutôt qu'un parseur : le fichier ne contient qu'une
# poignée de variables, et une dépendance de plus ne se justifie pas.
$anciennes = @{}
foreach ($ligne in Get-Content $fichier) {
    $ligne = $ligne.Trim()
    if (-not $ligne -or $ligne.StartsWith("#")) { continue }
    $coupure = $ligne.IndexOf("=")
    if ($coupure -lt 1) { continue }
    $nom = $ligne.Substring(0, $coupure).Trim()
    $valeur = $ligne.Substring($coupure + 1).Trim().Trim('"')
    $anciennes[$nom] = [Environment]::GetEnvironmentVariable($nom)
    Set-Item -Path "Env:$nom" -Value $valeur
}

# DEBUG=True évite d'avoir à copier la vraie SECRET_KEY de production : elle
# ne sert à rien pour une commande en ligne, et moins elle circule, mieux
# c'est.
$anciennes["DJANGO_DEBUG"] = $env:DJANGO_DEBUG
$env:DJANGO_DEBUG = "True"

# Sans DATABASE_URL, settings.py retombe SILENCIEUSEMENT sur le SQLite local
# (dj_database_url.config a un `default=sqlite://...`). Le script annoncerait
# alors "Base de PRODUCTION" en migrant la base de developpement — et un
# `migrate` repondrait "No migrations to apply" de facon parfaitement
# rassurante. Mieux vaut refuser de demarrer.
if (-not $env:DATABASE_URL) {
    Write-Host "DATABASE_URL absent de .env.prod." -ForegroundColor Red
    Write-Host "Sans lui, Django utiliserait la base LOCALE en croyant parler a la production."
    Write-Host "Ajoutez la ligne DATABASE_URL=postgresql://... (valeur prise sur Render > Environment)."
    exit 1
}
if ($env:DATABASE_URL -notmatch "^postgres") {
    Write-Host "DATABASE_URL ne pointe pas sur PostgreSQL." -ForegroundColor Red
    exit 1
}

# Affiche la CIBLE, jamais l'identifiant ni le mot de passe : on doit pouvoir
# copier toute la fenetre sans rien divulguer. Seul l'hote est montre, et
# encore, ampute de sa partie identifiante.
$hote = "inconnu"
if ($env:DATABASE_URL -match "@([^/:?]+)") {
    $morceaux = $matches[1].Split(".")
    if ($morceaux.Count -gt 2) {
        $hote = "(...)." + ($morceaux[-2..-1] -join ".")
    } else {
        $hote = $matches[1]
    }
}

Write-Host "Base de PRODUCTION ($hote) - commande : $($args -join ' ')" -ForegroundColor Cyan
Write-Host ""

try {
    & (Join-Path $racine "venv\Scripts\python.exe") (Join-Path $racine "manage.py") @args
    $code = $LASTEXITCODE
} finally {
    # On remet l'environnement dans son état d'origine : sans ça, la fenêtre
    # resterait branchée sur la production, et la commande suivante — un
    # flush, un migrate — s'y appliquerait sans prévenir.
    foreach ($nom in $anciennes.Keys) {
        if ($null -eq $anciennes[$nom]) {
            Remove-Item -Path "Env:$nom" -ErrorAction SilentlyContinue
        } else {
            Set-Item -Path "Env:$nom" -Value $anciennes[$nom]
        }
    }
}

exit $code
