# Rendimientos AR

Sitio para comparar rendimientos de productos financieros en Argentina y monitorear mercados globales.

- Monitor global en tiempo real (futuros S&P, Nasdaq, petróleo, oro, crypto, tasas)
- Marquesina de noticias financieras en vivo
- Billeteras y cuentas remuneradas
- Fondos comunes de inversión de liquidez
- Plazos fijos
- LECAPs y BONCAPs
- Bonos soberanos USD (ley local + ley NY)

Live en [rendimientos.co](https://rendimientos.co)

## Fuentes de datos

| Sección | Fuente | Actualización |
|---------|--------|---------------|
| Monitor Global | [Yahoo Finance](https://query1.finance.yahoo.com) v8/chart (intraday 5min) | En vivo |
| Noticias | [Google News RSS](https://news.google.com) (últimas 3h, finanzas AR) | En vivo (cache 2min) |
| Billeteras | Manual en `config.json` | Manual |
| FCIs | [ArgentinaDatos](https://api.argentinadatos.com) via CAFCI | En vivo |
| Plazo Fijo | [ArgentinaDatos](https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo) | En vivo |
| LECAPs/BONCAPs | [data912](https://data912.com) (`/live/arg_notes` + `/live/arg_bonds`) | En vivo |
| Soberanos USD | [data912](https://data912.com/live/arg_bonds) (tickers con sufijo D) | En vivo |

## Estructura

```
public/
  index.html         Pagina principal (3 secciones: Mundo, ARS, Bonos USD)
  app.js             Logica del frontend
  config.json        Billeteras, FCIs, LECAPs, Soberanos (flujos)
  styles.css         Estilos + dark mode
  comparar.html      Comparador de fondos (deshabilitado)
server.js            Servidor Express para desarrollo local
netlify/functions/
  cafci.js           Proxy ArgentinaDatos -> FCIs con TNA calculada
  lecaps.js          Proxy data912 -> precios de LECAPs y BONCAPs
  soberanos.js       Proxy data912 -> precios de bonos soberanos en USD
  mundo.js           Proxy Yahoo Finance -> futuros, commodities, crypto (con sparklines)
  news.js            Proxy Google News RSS -> noticias financieras en tiempo real
  visits.js          Contador de visitas publico
netlify.toml         Deploy config y redirects API
```

## Como levantar localmente

```bash
npm install
npm start
# http://localhost:3000
```

Nota: las Netlify functions (mundo, soberanos, etc.) solo funcionan en produccion. El server local sirve FCIs y config.

## Endpoints

| Ruta | Descripcion |
|------|-------------|
| `GET /api/mundo` | Monitor global: precios + sparklines intradiarias (Yahoo Finance) |
| `GET /api/news` | Noticias financieras ultimas 3h (Google News RSS) |
| `GET /api/config` | Config estatica (billeteras, FCIs, LECAPs, soberanos) |
| `GET /api/fci` | FCIs con TNA calculada (proxy ArgentinaDatos) |
| `GET /api/lecaps` | Precios LECAP/BONCAP en vivo (proxy data912) |
| `GET /api/soberanos` | Bonos soberanos precios en USD (proxy data912) |
| `GET /api/visits` | Contador de visitas |

## Monitor Global

Muestra 8 indicadores en tiempo real con sparklines intradiarias: S&P 500, Nasdaq 100, WTI, Tasa 10Y USA, Oro, Bitcoin, Ethereum, EUR/USD. Cada tarjeta muestra precio, variacion porcentual y mini grafico del dia con punto parpadeante.

## Noticias (marquesina)

Cinta horizontal con las ultimas noticias financieras. Se actualiza cada 2 minutos. Fuentes: Bloomberg Linea, Infobae, El Cronista, CriptoNoticias, Investing.com, etc.

## LECAPs y BONCAPs

1. Precios en vivo de data912 (`/live/arg_notes` + `/live/arg_bonds`), campo `c` (ultimo operado)
2. Pago final y vencimiento en `config.json`
3. TIR y TNA calculadas desde fecha de liquidacion T+1 (saltando feriados AR)
4. Scatter plot con curva polinomica

## Soberanos USD

1. Precios en USD de data912 (tickers con sufijo "D": AL30D, GD30D, etc.)
2. Flujos de fondos (cupones + amortizacion) en `config.json`, por cada 100 VN
3. TIR (YTM) via Newton-Raphson, Duration Macaulay
4. Yield curve: scatter plot separado por ley local (naranja) y ley NY (azul)
5. Bonos: AO27, AN29, AL29, AL30, AL35, AE38, AL41 + GD29, GD30, GD35, GD38, GD41 + BPD7

## Deploy

```bash
npx netlify deploy --prod
```
