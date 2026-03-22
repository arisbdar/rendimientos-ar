# Rendimientos AR

Sitio para comparar rendimientos de productos financieros en Argentina:

- Billeteras y cuentas remuneradas
- Fondos comunes de inversion de liquidez
- Plazos fijos
- LECAPs y BONCAPs

Live en [rendimientos.co](https://rendimientos.co)

## Fuentes de datos

| Seccion | Fuente | Actualizacion |
|---------|--------|---------------|
| Billeteras | Manual en `config.json` | Manual |
| FCIs | [ArgentinaDatos API](https://argentinadatos.com) via CAFCI | En vivo |
| Plazo Fijo | [ArgentinaDatos API](https://argentinadatos.com) | En vivo |
| LECAPs | [BYMA API](https://open.bymadata.com.ar) via Netlify function proxy | En vivo (7/14 tickers) |
| BONCAPs | Manual en `config.json` (no disponibles en API gratuita BYMA) | Manual |

## Estructura

```
public/              Frontend estatico
  index.html         Pagina principal (3 tabs: Billeteras, Plazo Fijo, LECAPs)
  app.js             Logica del frontend
  config.json        Datos de billeteras, FCIs, LECAPs (precios manuales)
  styles.css         Estilos + dark mode
  comparar.html      Comparador de fondos
server.js            Servidor local Express (dev)
update_lecaps.js     Script para actualizar precios LECAP desde BYMA
netlify/functions/
  cafci.js           Proxy ArgentinaDatos para FCIs
  lecaps.js          Proxy BYMA para precios de LECAPs en vivo
netlify.toml         Config de deploy y redirects
```

## Como levantar localmente

```bash
npm install
npm start
# http://localhost:3000
```

## Endpoints

| Ruta | Descripcion |
|------|-------------|
| `GET /api/config` | Config con billeteras, FCIs y LECAPs |
| `GET /api/fci` | FCIs con TNA calculada (proxy ArgentinaDatos) |
| `GET /api/lecaps` | Precios LECAP en vivo (proxy BYMA) |
| `GET /api/cafci/ficha/:fondoId/:claseId` | Ficha tecnica de fondo (proxy CAFCI) |

## LECAPs: como funciona

1. El frontend llama a `/api/lecaps` que proxea la API gratuita de BYMA (`/lebacs`)
2. BYMA devuelve precios T+1 con 20min de delay — se usa el ultimo operado (`trade`)
3. Los tickers que no estan en la API gratuita (BONCAPs) usan precios de `config.json`
4. Se calcula TIR y TNA desde la fecha de liquidacion (T+1 dia habil, saltando feriados AR)

Para actualizar precios manualmente:

```bash
# Actualiza los 7 tickers disponibles en BYMA
NODE_TLS_REJECT_UNAUTHORIZED=0 node update_lecaps.js

# Dry run (no escribe)
NODE_TLS_REJECT_UNAUTHORIZED=0 node update_lecaps.js --dry-run
```

## Deploy

Deploy directo a Netlify:

```bash
npx netlify deploy --prod --dir=public
```

## Seguridad del server local

- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
