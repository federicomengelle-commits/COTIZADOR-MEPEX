#!/usr/bin/env bash
# =============================================
# MEPEX COTIZADOR — script de deploy
# =============================================
# Correr en el VPS despues de cada push a main.
# Flujo: git pull + npm install + restart del backend.
#
# Uso en PuTTY / SSH:
#   bash ~/cotizador/deploy/update.sh
#
# O, si esta ejecutable (chmod +x):
#   ~/cotizador/deploy/update.sh
#
# Setup inicial: ver deploy.md en la raiz del repo.
# =============================================

set -e  # cortar a la primera falla

# Detectar path del repo de forma portable (no depende de donde se corra)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# === CONFIG (editar si cambia algo) ===
SERVICE_NAME="${COTIZADOR_SERVICE:-cotizador-api}"   # nombre del proceso PM2 / systemd
BRANCH="${COTIZADOR_BRANCH:-main}"                    # rama a pullear
# ======================================

cd "$PROJECT_DIR"

echo ""
echo "=========================================="
echo "  MEPEX COTIZADOR — deploy"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Repo: $PROJECT_DIR"
echo "=========================================="

# --- 1) Pull ---
echo ""
echo "→ Bajando ultimos cambios de $BRANCH..."
git fetch origin "$BRANCH"

# Guardar hash previo para el resumen del final
BEFORE=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Reset duro para descartar cambios locales accidentales (ej: npm install tocando package-lock)
git reset --hard "origin/$BRANCH"

AFTER=$(git rev-parse --short HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
    echo "   ↳ ya estabas al dia ($AFTER). Reinicio igual por si cambio .env o deps."
else
    echo "   ↳ $BEFORE → $AFTER"
fi

# --- 2) Deps del backend ---
echo ""
echo "→ Instalando deps del backend..."
cd server

# Si no existe .env, avisar pero no abortar (puede que el server ya tenga uno)
if [ ! -f ".env" ]; then
    echo "   ⚠ server/.env no existe. Ver deploy.md para la config de secretos."
fi

# --silent suprime solo el output normal; errores siguen apareciendo
npm install --omit=dev --silent

# --- 3) Restart del backend ---
echo ""
echo "→ Reiniciando backend ($SERVICE_NAME)..."
RESTART_OK=0

if command -v pm2 >/dev/null 2>&1 && pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
    pm2 restart "$SERVICE_NAME" --update-env
    echo "   ↳ PM2: restart OK"
    RESTART_OK=1
elif systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE_NAME}\.service"; then
    sudo systemctl restart "$SERVICE_NAME"
    echo "   ↳ systemd: restart OK"
    RESTART_OK=1
fi

if [ "$RESTART_OK" -eq 0 ]; then
    echo "   ⚠ No encontre '$SERVICE_NAME' en PM2 ni systemd."
    echo "     Reinicia el backend manualmente o configura uno — ver deploy.md."
fi

# --- 4) Health check rapido ---
echo ""
echo "→ Health check..."
sleep 2  # dar tiempo al backend a levantar
if command -v curl >/dev/null 2>&1; then
    PORT="${PORT:-3001}"
    if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/api/health" | grep -qE "^(200|204)$"; then
        echo "   ↳ backend responde en :$PORT ✓"
    else
        echo "   ⚠ backend no responde en :$PORT/api/health (quiza no hay endpoint health, revisar pm2 logs)"
    fi
else
    echo "   (curl no disponible, saltando check)"
fi

# --- Resumen final ---
echo ""
echo "=========================================="
echo "  ✓ Deploy listo"
git log -1 --pretty=format:'  Ultimo commit: %h %s%n  Autor: %an · %ar'
echo ""
echo "=========================================="
echo ""
