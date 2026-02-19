@echo off
title MEPEX - Detener Servidor
color 0C

echo.
echo  Buscando y deteniendo servidor MEPEX...
echo.

:: Buscar y matar procesos de Node.js que estén usando el puerto 3001
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3001" ^| find "LISTENING"') do (
    echo  Deteniendo proceso PID: %%a
    taskkill /F /PID %%a >nul 2>nul
)

echo.
echo  ✓ Servidor detenido correctamente
echo.
timeout /t 2 /nobreak >nul
