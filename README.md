# Rendimientos AR

Sitio para comparar rendimientos de productos financieros en Argentina:

- billeteras y cuentas remuneradas
- fondos comunes de inversión de liquidez
- plazos fijos

El proyecto combina contenido estático con datos actualizados desde fuentes externas y un pequeño servidor Express para desarrollo local.

## Qué hace

La app muestra rankings y comparativas de:

- cuentas y billeteras con TNA configurada manualmente
- FCIs de liquidez con TNA calculada a partir de datos recientes
- plazos fijos de bancos argentinos, actualizados por scraping

La información visible del sitio vive principalmente en:

- [`public/config.json`](./public/config.json)
- [`data/config.json`](./data/config.json)

## Fuentes de datos

### BCRA

Las tasas de plazo fijo se obtienen desde el comparador de tasas del BCRA usando el script:

- [`scrape_bcra_pf.js`](./scrape_bcra_pf.js)

Ese script actualiza:

- [`public/config.json`](./public/config.json)
- [`data/config.json`](./data/config.json)

### ArgentinaDatos / CAFCI

Los FCIs se alimentan desde endpoints públicos de ArgentinaDatos y se transforman a TNA en:

- [`server.js`](./server.js)
- [`netlify/functions/cafci.js`](./netlify/functions/cafci.js)

Endpoints utilizados:

- `https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/ultimo`
- `https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/penultimo`
- `https://api.argentinadatos.com/v1/finanzas/fci/rentaMixta/ultimo`
- `https://api.argentinadatos.com/v1/finanzas/fci/rentaMixta/penultimo`

## Estructura

- [`public/`](./public/) frontend estático
- [`server.js`](./server.js) servidor local Express
- [`scrape_bcra_pf.js`](./scrape_bcra_pf.js) scraping de plazo fijo
- [`netlify/functions/`](./netlify/functions/) functions para despliegue en Netlify
- [`.github/workflows/update-rates.yml`](./.github/workflows/update-rates.yml) actualización automática diaria

## Requisitos

- Node.js 20+ recomendado
- npm

Para el scraping local también necesitás que Puppeteer pueda lanzar Chrome/Chromium.

## Cómo levantarlo localmente

1. Instalar dependencias:

```bash
npm install
```

2. Crear archivo de entorno:

```bash
cp .env.example .env
```

3. Levantar el servidor:

```bash
npm start
```

Por defecto queda disponible en:

- `http://localhost:3000`

También podés cambiar el puerto:

```bash
PORT=4000 npm start
```

## Variables de entorno

Ejemplo:

```env
PORT=3000
NODE_ENV=development
```

## Scripts

- `npm start`: levanta el servidor local
- `npm run scrape:pf`: ejecuta el scraping de tasas de plazo fijo y actualiza los archivos de config
- `npm run scrape:pf:dry`: corre el scraping sin escribir archivos
- `npm test`: chequeo de sintaxis de los entrypoints principales

## Endpoints locales

El servidor local expone:

- `GET /api/config`: devuelve la config actual
- `GET /api/fci`: devuelve FCIs con TNA calculada

Además sirve el frontend estático desde [`public/`](./public/).

## Deploy y automatización

El proyecto está preparado para Netlify mediante [`netlify.toml`](./netlify.toml):

- publica `public/`
- expone `/.netlify/functions/cafci` como `/api/fci`
- expone `public/config.json` como `/api/config`

El workflow [`update-rates.yml`](./.github/workflows/update-rates.yml) hace esto todos los días:

1. instala dependencias
2. ejecuta el scraping del BCRA
3. commitea cambios en la config si hubo diferencias
4. hace deploy a Netlify

## Seguridad básica del server local

El server local agrega algunos headers defensivos:

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Limitaciones actuales

- La vista [`public/comparar.html`](./public/comparar.html) usa `/api/cafci/ficha/:fondoId/:claseId`, pero ese endpoint no está implementado en [`server.js`](./server.js). Si se quiere usar localmente, hace falta agregar ese proxy o adaptar la página.
- Parte del contenido del sitio depende de APIs públicas de terceros; si cambian formato o disponibilidad, algunas vistas pueden degradarse.
- El scraping del BCRA depende de la estructura HTML actual del sitio fuente.

## Próximos pasos

- Agregar validación automática de `public/config.json` y `data/config.json` en CI.
- Implementar o remover la dependencia de `/api/cafci/ficha/:fondoId/:claseId` para que la vista de comparación quede consistente.
- Agregar tests básicos de integración para `GET /api/config` y `GET /api/fci`.
- Mejorar la tolerancia a fallos de APIs externas, por ejemplo guardando un último valor válido para FCIs.
- Documentar con más detalle el esquema de `config.json` y el flujo de actualización de datos.
- Revisar si conviene mantener dos archivos de config (`public/config.json` y `data/config.json`) o consolidarlos.

## Archivos más importantes

- [`public/index.html`](./public/index.html)
- [`public/app.js`](./public/app.js)
- [`public/config.json`](./public/config.json)
- [`server.js`](./server.js)
- [`scrape_bcra_pf.js`](./scrape_bcra_pf.js)
- [`.github/workflows/update-rates.yml`](./.github/workflows/update-rates.yml)
