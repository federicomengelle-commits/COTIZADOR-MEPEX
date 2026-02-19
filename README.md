# MEPEX Cotizador - Sistema con Notion Integration

## 🏗️ Arquitectura

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Notion DB     │  →   │   Backend Node   │  →   │   Cotizador     │
│ (Catálogo)      │      │   (Express API)  │      │   (Frontend)    │
└─────────────────┘      └──────────────────┘      └─────────────────┘
```

## 📦 Estructura del Proyecto

```
APP MEPEX 3/
├── index.html          # Aplicación principal
├── style.css           # Estilos
├── script.js           # Lógica de la app
├── database.js         # Base de datos local (fallback)
├── api.js              # Cliente para conectar con el backend
├── logo_full.png       # Logo MEPEX
│
└── server/             # Backend Node.js
    ├── package.json    # Dependencias
    ├── index.js        # Servidor Express
    ├── .env            # Variables de entorno (TOKEN!)
    └── .gitignore      # Ignorar node_modules y .env
```

## 🚀 Instalación

### 1. Instalar Node.js
Descargar desde [nodejs.org](https://nodejs.org/) (versión LTS recomendada)

### 2. Instalar dependencias del backend
```bash
cd server
npm install
```

### 3. Configurar el token de Notion
Editar `server/.env` con tu token:
```
NOTION_TOKEN=ntn_xxxxx
NOTION_DATABASE_ID=xxxxx
```

### 4. Iniciar el backend
```bash
cd server
npm run dev
```

### 5. Abrir el frontend
Abrir `index.html` en el navegador (con Live Server o similar)

## 📡 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/catalog` | Obtener todos los items |
| GET | `/api/catalog/schema` | Estructura de la DB |
| GET | `/api/catalog/category/:cat` | Filtrar por categoría |
| PUT | `/api/catalog/:id` | Actualizar item |
| POST | `/api/catalog` | Crear nuevo item |

## 🔧 Modo de Funcionamiento

### Con Backend (Online)
- Badge muestra "Notion" en verde
- Items se cargan desde Notion en tiempo real
- Cambios de precios se reflejan inmediatamente
- Admin puede editar desde Notion

### Sin Backend (Offline)
- Badge muestra "Local" en gris
- Items se cargan desde `database.js`
- Funcionalidad completa, pero datos estáticos

## 📋 Estructura de la DB en Notion

| Campo | Tipo | Descripción |
|-------|------|-------------|
| Item | Título | Nombre del producto |
| Código | Texto | SKU o código interno |
| Descripción | Texto | Descripción larga |
| Categoría | Multi-select | Mobiliario, Iluminación, etc. |
| Unidad | Select | Unidad, m2, ml, día |
| Importe | Número | Precio en pesos |

## 🎨 Categorías Sugeridas

- Pisos
- Infraestructura
- Iluminación
- Mobiliario
- Tecnología
- Gráfica & Branding
- Electricidad
- Servicios

## 🔒 Seguridad

- El token de Notion está almacenado solo en el backend (`.env`)
- El frontend NO tiene acceso directo al token
- `.env` está en `.gitignore` para no subirlo al repositorio
