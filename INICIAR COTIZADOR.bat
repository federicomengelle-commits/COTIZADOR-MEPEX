@echo off
title MEPEX Cotizador - Servidor
color 0B

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║                                                          ║
echo  ║              MEPEX COTIZADOR - INICIANDO                 ║
echo  ║                                                          ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

:: Ir a la carpeta del proyecto
cd /d "%~dp0"

:: Verificar si Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js no esta instalado!
    echo  Por favor instala Node.js desde https://nodejs.org
    pause
    exit /b 1
)

echo  [1/4] Deteniendo servidores anteriores...
:: Matar cualquier proceso en el puerto 3001
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3001" ^| find "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>nul
)
timeout /t 1 /nobreak >nul

echo  [2/4] Verificando dependencias del servidor...
cd server

:: Instalar dependencias si no existen
if not exist "node_modules" (
    echo  [!] Instalando dependencias por primera vez...
    call npm install
)

echo  [3/4] Iniciando servidor en puerto 3001...
echo.

:: Iniciar el servidor en segundo plano
start /min cmd /c "title MEPEX API Server && node index.js"

:: Esperar un momento para que el servidor inicie
echo  Esperando que el servidor inicie...
timeout /t 3 /nobreak >nul

echo  [4/4] Abriendo navegador...
echo.

:: Abrir el navegador en localhost:3001 (NO en el archivo local)
start "" "http://localhost:3001"

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║                                                          ║
echo  ║   ✓ Servidor corriendo en http://localhost:3001         ║
echo  ║   ✓ Aplicación abierta en el navegador                  ║
echo  ║                                                          ║
echo  ║   IMPORTANTE: Usa siempre http://localhost:3001         ║
echo  ║   NO abras el archivo index.html directamente           ║
echo  ║                                                          ║
echo  ║   Para detener el servidor, cierra la ventana           ║
echo  ║   minimizada "MEPEX API Server"                         ║
echo  ║                                                          ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo  Presiona cualquier tecla para cerrar esta ventana...
echo  (El servidor seguira corriendo en segundo plano)
echo.
pause >nul
