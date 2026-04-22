# Deploy — MEPEX Cotizador

Misma lógica que el LOBBY pero con backend: push desde local, pull + restart en el VPS.

## 1) Push desde local

```bash
git add .
git commit -m "descripción del cambio"
git push origin main
```

## 2) Pull + restart en el VPS

Entrar por PuTTY / SSH y correr:

```bash
bash ~/cotizador/deploy/update.sh
```

(Ajustar `~/cotizador` al path donde esté clonado el repo.)

El script hace:

1. `git fetch` + `git reset --hard origin/main` — baja los últimos cambios y descarta locales accidentales
2. `npm install --omit=dev` en `server/`
3. `pm2 restart cotizador-api` (o `systemctl restart cotizador-api` como fallback)
4. Health check rápido contra `:3001/api/health`

Si todo ok: imprime el hash del último commit y sale. Si algo falla: `set -e` corta y muestra el error.

---

## Setup inicial en el VPS (una sola vez)

### Clonar el repo

```bash
cd ~
git clone https://github.com/federicomengelle-commits/COTIZADOR-MEPEX.git cotizador
cd cotizador
chmod +x deploy/update.sh
```

### Crear `server/.env`

El repo NO incluye `.env` (está en `.gitignore`). Crearlo a mano:

```bash
cd server
nano .env
```

Contenido mínimo:

```
SUPABASE_URL=https://selnevalaeykdrgycvdz.supabase.co
SUPABASE_SERVICE_KEY=<la_key_real>
PORT=3001
```

### Instalar PM2 y levantar el backend

```bash
npm install -g pm2
cd ~/cotizador/server
pm2 start index.js --name cotizador-api
pm2 save
pm2 startup    # seguir las instrucciones que imprime para auto-start en boot
```

A partir de acá, cada deploy es sólo: `bash ~/cotizador/deploy/update.sh`.

---

## Alias opcional (para que sea un solo comando)

Agregar al `~/.bashrc` del VPS:

```bash
alias deploy-cot='bash ~/cotizador/deploy/update.sh'
```

Después `source ~/.bashrc` y ya podés hacer:

```bash
deploy-cot
```

## Variables de entorno del script

Se pueden override desde la terminal sin editar el script:

```bash
COTIZADOR_BRANCH=staging bash ~/cotizador/deploy/update.sh
COTIZADOR_SERVICE=mi-proceso bash ~/cotizador/deploy/update.sh
```

Defaults: `BRANCH=main`, `SERVICE_NAME=cotizador-api`.
