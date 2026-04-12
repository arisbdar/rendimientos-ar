# CLAUDE.md

## Proyecto

Rendimientos AR - Sitio para comparar rendimientos de productos financieros en Argentina, monitorear mercados globales, y gestionar portfolios de inversiones. Live en [rendimientos.co](https://rendimientos.co).

## Stack

- **Frontend**: Vanilla JS + CSS (no framework), Chart.js para graficos, SVG inline icons (Lucide/Feather style)
- **Backend**: Express.js (local dev), Vercel Serverless Functions (prod)
- **Auth + DB**: Supabase (Google OAuth, PostgreSQL con RLS)
- **Datos**: ArgentinaDatos API (FCIs, Plazo Fijo), data912 (LECAPs, Bonos, ONs), Yahoo Finance (Monitor Global), Google News RSS, Google Sheets (Hipotecarios UVA)
- **Analytics**: Supabase (tabla `page_views`)
- **Deploy**: Vercel (`npx vercel --prod`)
- **Dominio**: rendimientos.co (canonical), comparatasas.vercel.app (Vercel)

## Estructura clave

- `public/index.html` - SPA con 6 secciones: Mundo, ARS, Bonos, ONs, Hipotecarios, Portfolio
- `public/app.js` - Toda la logica del frontend (~2900 lineas)
- `public/config.json` - Config estatica (billeteras, LECAPs, flujos bonos)
- `public/styles.css` - Estilos + dark mode con CSS variables
- `server.js` - Server Express para dev local
- `api/` - Funciones serverless Vercel (proxies de APIs + auth-config)

### Funciones Serverless (api/)

- `cafci.js` - Proxy para FCIs via ArgentinaDatos
- `cer.js`, `cer-precios.js`, `cer-ultimo.js` - Datos CER (BCRA + data912)
- `lecaps.js` - LECAPs/BONCAPs via data912
- `soberanos.js` - Bonos soberanos USD via data912
- `ons.js` - Obligaciones Negociables via data912
- `mundo.js` - Monitor global via Yahoo Finance
- `news.js` - Noticias financieras via Google News RSS
- `hipotecarios.js` - Créditos hipotecarios UVA via Google Sheets CSV export
- `auth-config.js` - Devuelve Supabase URL + anon key desde env vars

### Supabase (DB)

- **Tabla `holdings`**: Portfolio del usuario (asset_type, ticker, quantity, purchase_price, purchase_date, metadata JSONB). RLS por user_id.
- **Tabla `page_views`**: Analytics de visitas (path, referrer, timestamp). Insert publico, select restringido.
- **Auth**: Google OAuth via PKCE flow.

## Desarrollo local

```bash
npm install && npm start  # http://localhost:3000
```

Variables de entorno necesarias (`.env`):
```
PORT=3000
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
```

Nota: Las funciones serverless (mundo, soberanos, news, etc) solo funcionan en produccion. El server local sirve FCIs, config y auth-config.

## Reglas

- Mantener el sitio vanilla (sin frameworks JS/CSS)
- No usar emojis en la UI — usar SVGs inline (estilo Lucide/Feather, stroke-based). Helper `_icon()` en app.js para generar iconos.
- Respetar el sistema de temas dark/light con CSS variables
- Los logos de bancos se guardan en `public/logos/` (SVGs de icons.com.ar + PNGs de logo_cache). Mapeos en `PLAZO_FIJO_LOGOS` y `HIPOTECARIO_LOGOS` en app.js. Fallback: BCRA API (http -> upgradar a https) o iniciales con color.
- Los datos de billeteras/cuentas remuneradas son manuales en config.json
- El SEO usa el dominio `rendimientos.co` (canonical), deploy en Vercel
- Las calculadoras de bonos incluyen campos de Arancel e Impuestos (editables por el usuario)
- El portfolio usa Supabase con RLS — cada usuario solo ve sus holdings
- El tipo de cambio implicito (CCL) se calcula desde AL30/AL30D de data912

## Portfolio

El feature de portfolio soporta estos tipos de activos:
- **Soberanos** (AL29, GD30, etc) - precio live en USD, flujos de fondos
- **ONs** (MGCR, BACG, etc) - precio live en USD, flujos de fondos
- **Bonos CER** (TX26, DICP, etc) - precio live en ARS, flujos ajustados por CER
- **LECAPs** (S17A6, etc) - precio live en ARS, pago al vencimiento
- **FCIs** - valor cuotaparte
- **Billeteras** - monto fijo con TNA
- **Cash** - USD o ARS
- **Custom** - activos personalizados (Bitcoin, acciones, etc) con precio manual

## Hipotecarios UVA

Sección de ranking de créditos hipotecarios UVA. Los datos se consumen de un Google Sheet publicado (ID: `1h191b61YRkAI9Xv3_dDuNf7ejst_ziw9kacfJsnvLoM`, GID: `1120229027`) que exporta como CSV con columnas: Banco, TNA, Plazo Máximo, Relación Cuota/Ingreso, % Financiamiento.

- **Fuente**: [@SalinasAndres](https://x.com/SalinasAndres) (atribuido en la UI)
- **Endpoint**: `/api/hipotecarios` (Vercel serverless function `hipotecarios.js`)
- **Logos**: `HIPOTECARIO_LOGOS` en app.js, archivos en `public/logos/`
- **Ordenamiento**: TNA ascendente (menor tasa = mejor para el tomador)
- **Renderizado**: Cards con tags (plazo, financiamiento, cuota/ingreso) + gráfico de barras horizontal

---

## Prompts para agentes

Prompts listos para usar con Claude Code u otros agentes AI para operar sobre este repo.

### Actualizar tasas de billeteras

```
Lee public/config.json y actualiza las TNA de las billeteras/cuentas remuneradas
que hayan cambiado. Los datos estan en la seccion "garantizados".
Cada entrada tiene: nombre, tipo, limite, tna, vigente_desde.
Actualiza vigente_desde a la fecha de hoy en formato DD/MM/YYYY.
No modifiques entradas cuya tasa no cambio.

Billeteras a actualizar:
- [nombre]: [nueva TNA]%
```

### Agregar nueva billetera/cuenta remunerada

```
Agrega una nueva entrada en public/config.json, seccion "garantizados".
Sigue el formato existente. El campo "id" es kebab-case del nombre.
Si tiene logo propio, agrega el mapping en ENTITY_LOGOS en public/app.js.
Si tiene condiciones especiales, ponerlo en la seccion "especiales" en vez de "garantizados".

Datos:
- Nombre: [nombre]
- Tipo: Billetera | Cuenta Remunerada
- Limite: [ej: $1 M]
- TNA: [numero]
- Vigente desde: [DD/MM/YYYY]
- Logo (2 letras): [XX]
- Color logo: [hex]
```

### Agregar nuevo bono soberano

```
Agrega un nuevo bono soberano en public/config.json, seccion "soberanos".
Necesitas los flujos de fondos futuros (cupon + amortizacion) por cada 100 VN.
Sigue el formato de los bonos existentes (AL30, GD30, etc).

Datos:
- Ticker (local): [ej: AL30]
- Ticker data912 (con D): [ej: AL30D]
- Ley: Local | NY
- Vencimiento: [YYYY-MM-DD]
- Flujos: [lista de {fecha, cupon, amortizacion}]
```

### Actualizar LECAPs/BONCAPs

```
Los LECAPs y BONCAPs se leen de public/config.json, seccion "lecaps".
Cuando se emite una nueva LECAP/BONCAP, agrega la entrada con:
- ticker: [ej: S17A6]
- tipo: LECAP | BONCAP
- vencimiento: [YYYY-MM-DD]
- pago_final: [monto por 100 VN]

Los precios se obtienen en vivo de data912, no hace falta actualizar precios.
```

### Actualizar hipotecarios UVA

```
Los datos de hipotecarios UVA se consumen de un Google Sheet publicado.
Si se agrega un nuevo banco al sheet, verificar que tenga logo en public/logos/.
Si no tiene, buscarlo en https://icons.com.ar/ y descargarlo como SVG.
Luego agregar el mapping en HIPOTECARIO_LOGOS en public/app.js.
```

### Dogfood / QA del sitio

```
Navega https://rendimientos.co/ como un usuario real.
Revisa cada seccion: Mundo, ARS (Billeteras, Plazo Fijo, LECAPs, CER), Bonos, ONs, Hipotecarios, Portfolio.
Busca:
- Links rotos o que no funcionan
- Datos desactualizados o inconsistentes
- Problemas visuales en mobile y desktop
- Errores en consola del browser
- Problemas de accesibilidad (contraste, labels, keyboard nav)
- SEO (meta tags, OG, canonical)
Documenta cada hallazgo con severidad, categoria y pasos para reproducir.
```

### Deploy

```
Ejecuta `npx vercel --prod` desde la raiz del repo.
Verifica que el sitio cargue correctamente en https://rendimientos.co/
```
