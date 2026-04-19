# Rendimientos AR

Sitio para comparar rendimientos de productos financieros en Argentina y monitorear mercados globales.

- Monitor global en tiempo real (futuros S&P, Nasdaq, petróleo, oro, crypto, tasas)
- Marquesina de noticias financieras en vivo
- Billeteras y cuentas remuneradas
- Fondos comunes de inversión de liquidez
- Plazos fijos
- LECAPs y BONCAPs
- Bonos CER (ajustados por inflación)
- Bonos soberanos USD (ley local + ley NY)
- Obligaciones Negociables (ONs) corporativas en USD

Live en [rendimientos.co](https://rendimientos.co) — PWA instalable.

## Secciones

| Sección (header) | Contenido |
|-------------------|-----------|
| 🌍 Mundo | Monitor global con indicadores + sparklines intradiarias + gráficos ampliados + BTC Treasury top 10 |
| 🇦🇷 ARS | Billeteras, FCIs, Plazo Fijo, LECAPs/BONCAPs, Bonos CER |
| 🏛️ Bonos | Soberanos USD (ley local + ley NY) con yield curve |
| 🏢 ONs | Obligaciones Negociables corporativas USD con calculadora interactiva |

## Fuentes de datos

| Sección | Fuente | Actualización |
|---------|--------|---------------|
| Monitor Global | [Yahoo Finance](https://query1.finance.yahoo.com) v8/chart (intraday 5min) | En vivo |
| BTC Treasury | [CoinGecko](https://api.coingecko.com/api/v3/companies/public_treasury/bitcoin) (ranking) + Yahoo Finance (precios) | En vivo (cache 1h) |
| Noticias | [Google News RSS](https://news.google.com) (últimas 3h, finanzas AR) | En vivo (cache 2min) |
| Billeteras | Manual en `config.json` | Manual |
| FCIs | [ArgentinaDatos](https://api.argentinadatos.com) via CAFCI | En vivo |
| Plazo Fijo | [ArgentinaDatos](https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo) | En vivo |
| LECAPs/BONCAPs | [data912](https://data912.com) (`/live/arg_notes` + `/live/arg_bonds`) | En vivo |
| Bonos CER | [BCRA](https://api.bcra.gob.ar) (índice CER) + [data912](https://data912.com/live/arg_bonds) (precios) | En vivo |
| Soberanos USD | [data912](https://data912.com/live/arg_bonds) (tickers con sufijo D) | En vivo |
| ONs | [data912](https://data912.com/live/arg_corp) (precios USD) | En vivo |

## Estructura

```
public/
  index.html         Página principal (4 secciones: Mundo, ARS, Bonos, ONs)
  app.js             Lógica del frontend
  config.json        Billeteras, FCIs, LECAPs, Soberanos, CER, ONs (flujos)
  styles.css         Estilos + dark mode
  manifest.json      PWA manifest
  sw.js              Service worker
  icons/             Íconos PWA (192x192, 512x512)
  comparar.html      Comparador de fondos (deshabilitado)
server.js            Servidor Express para desarrollo local
api/                 Funciones serverless Vercel
  cafci.js           Proxy ArgentinaDatos → FCIs con TNA calculada
  lecaps.js          Proxy data912 → precios de LECAPs y BONCAPs
  soberanos.js       Proxy data912 → precios de bonos soberanos en USD
  ons.js             Proxy data912 → precios de ONs corporativas en USD
  cer.js             BCRA API → índice CER T-10
  cer-precios.js     Proxy data912 → precios de bonos CER
  cer-ultimo.js      BCRA API → último CER publicado (para UI)
  mundo.js           Proxy Yahoo Finance → futuros, commodities, crypto (con sparklines)
  btc-treasury.js    Top 10 BTC treasury companies (CoinGecko + Yahoo Finance)
  news.js            Proxy Google News RSS → noticias financieras en tiempo real
vercel.json          Deploy config
```

## Cómo levantar localmente

```bash
npm install
npm start
# http://localhost:3000
```

Las funciones serverless (mundo, soberanos, ons, cer, etc.) solo funcionan en producción (Vercel). El server local sirve FCIs y config.

## Endpoints

| Ruta | Descripción |
|------|-------------|
| `GET /api/mundo` | Monitor global: precios + sparklines intradiarias (Yahoo Finance) |
| `GET /api/mundo?symbol=X&range=Y` | Gráfico ampliado de un indicador (1d, 5d, 1m, 3m) |
| `GET /api/btc-treasury` | Top 10 BTC treasury companies con precios y sparklines (CoinGecko + Yahoo Finance, cache 1h) |
| `GET /api/news` | Noticias financieras últimas 3h (Google News RSS) |
| `GET /api/config` | Config estática (billeteras, FCIs, LECAPs, soberanos, CER, ONs) |
| `GET /api/fci` | FCIs con TNA calculada (proxy ArgentinaDatos) |
| `GET /api/lecaps` | Precios LECAP/BONCAP en vivo (proxy data912) |
| `GET /api/soberanos` | Bonos soberanos precios en USD (proxy data912) |
| `GET /api/ons` | ONs corporativas precios en USD (proxy data912) |
| `GET /api/cer` | Índice CER T-10 (BCRA) |
| `GET /api/cer-precios` | Bonos CER precios en ARS (proxy data912) |
| `GET /api/cer-ultimo` | Último CER publicado (BCRA) |
| `GET /api/visits` | Contador de visitas |

## Features

### Monitor Global
8 indicadores en tiempo real con sparklines intradiarias: S&P 500, Nasdaq 100, WTI, Tasa 10Y USA, Oro, Bitcoin, Ethereum, EUR/USD. Click en cualquier tarjeta para gráfico ampliado con rangos 1D/5D/1M/3M. Punto parpadeante indica datos en vivo.

### BTC Treasury
Top 10 empresas públicas con más Bitcoin en tesorería, obtenidas dinámicamente de CoinGecko. Muestra cotización bursátil (Yahoo Finance), sparkline intradiario y cantidad de BTC en tesorería. El ranking se actualiza automáticamente cada 1 hora.

### Noticias (marquesina)
Cinta horizontal con las últimas noticias financieras. Se actualiza cada 2 minutos. Botón para ocultar.

### LECAPs y BONCAPs
Precios en vivo de data912. TIR y TNA calculadas desde fecha de liquidación T+1 (saltando feriados AR). Scatter plot con curva polinómica. Tablas con columnas ordenables. Click en cualquier LECAP para calculadora interactiva (modificar precio → TIR/TNA se recalculan).

### Bonos CER
Bonos ajustados por inflación. Precios en ARS de data912, índice CER de BCRA (T-10). TIR real calculada con flujos ajustados por coeficiente CER (CER_actual / CER_emisión). Bonos: TX26, TX28, TZX26, TZX27, TZX28, TZXO6, TZXD6, TZXM6, TZXM7, TZXD7, DICP, PARP.

### Soberanos USD
Precios en USD de data912 (tickers con sufijo "D"). Flujos de fondos hardcodeados en config.json por cada 100 VN. TIR (YTM) via Newton-Raphson, Duration Macaulay. Yield curve separada por ley local (naranja) y ley NY (azul). Click para calculadora. Bonos: AO27, AN29, BPD7, AL29, AL30, AL35, AE38, AL41 + GD29, GD30, GD35, GD38, GD41.

### ONs (Obligaciones Negociables)
56 bonos corporativos en USD. Precios en vivo de data912 (`/live/arg_corp`). Flujos de fondos de Cashflows.xlsx. TIR y Duration calculados. Yield curve con regresión polinómica. Click en cualquier ON para calculadora interactiva (modificar precio → TIR/Duration se recalculan en vivo).

### Otras features
- Dark mode con toggle (persiste en localStorage)
- PWA instalable (manifest + service worker)
- Contador de visitas público
- Tablas ordenables (click en headers para sort asc/desc)
- Responsive mobile (scroll horizontal en tablas)

## Deploy

```bash
npx vercel --prod
```
