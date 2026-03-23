# CLAUDE.md

## Proyecto

Rendimientos AR - Sitio para comparar rendimientos de productos financieros en Argentina y monitorear mercados globales. Live en [rendimientos.co](https://rendimientos.co).

## Stack

- **Frontend**: Vanilla JS + CSS (no framework), Chart.js para graficos
- **Backend**: Express.js (local dev), Netlify Functions (prod)
- **Datos**: ArgentinaDatos API (FCIs, Plazo Fijo), data912 (LECAPs, CEDEARs, Bonos), Yahoo Finance (Monitor Global, CEDEARs USD), Google News RSS
- **Deploy**: Netlify (`npx netlify deploy --prod`)
- **Dominio**: rendimientos.co (canonical), rendimientos-ar.netlify.app (legacy)

## Estructura clave

- `public/index.html` - SPA con 4 secciones: Mundo, ARS, CEDEARs, Bonos
- `public/app.js` - Toda la logica del frontend
- `public/config.json` - Config estatica (billeteras, ratios CEDEARs, flujos bonos)
- `public/styles.css` - Estilos + dark mode con CSS variables
- `server.js` - Server Express para dev local
- `netlify/functions/` - Funciones serverless (proxies de APIs)

## Desarrollo local

```bash
npm install && npm start  # http://localhost:3000
```

Nota: Las Netlify functions (mundo, cedears, soberanos, news) solo funcionan en produccion. El server local sirve FCIs y config.

## Reglas

- Mantener el sitio vanilla (sin frameworks JS/CSS)
- Respetar el sistema de temas dark/light con CSS variables
- Los logos de bancos vienen de BCRA (http -> siempre upgradar a https)
- Los datos de billeteras/cuentas remuneradas son manuales en config.json
- El SEO usa el dominio `rendimientos.co`, no el legacy de Netlify

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

### Agregar nuevo CEDEAR

```
Agrega un nuevo CEDEAR a la tabla de ratios en public/config.json, seccion "cedears_ratios".
El formato es: { "ticker": "XXXX", "ratio": N }
donde ratio es la cantidad de CEDEARs que equivalen a 1 ADR.

Datos:
- Ticker: [ticker en BYMA]
- Ratio: [numero, ej: 5 significa 5:1]
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

### Dogfood / QA del sitio

```
Navega https://rendimientos.co/ como un usuario real.
Revisa cada seccion: Mundo, ARS (Billeteras, Plazo Fijo, LECAPs), CEDEARs, Bonos.
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
Ejecuta `npx netlify deploy --prod` desde la raiz del repo.
Verifica que el sitio cargue correctamente en https://rendimientos.co/
```

### Revisar rendimiento

```
Analiza el rendimiento del sitio:
1. Lee public/app.js y public/styles.css
2. Identifica:
   - Requests innecesarios o redundantes
   - Archivos grandes que podrian lazy-loadear
   - CSS que bloquea renderizado
   - Imagenes sin optimizar
3. Sugiere mejoras concretas con codigo.
```
