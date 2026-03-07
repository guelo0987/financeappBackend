# WealthOS — Backend README
> Documento de contexto completo para construir el backend de la aplicación.  
> Leer este archivo completo antes de escribir cualquier línea de código.

---

## ¿Qué es WealthOS?

WealthOS es una aplicación móvil iOS de **finanzas personales** orientada al mercado dominicano. Permite a los usuarios tener una visión completa de su patrimonio neto en un solo lugar: efectivo, cuentas bancarias, inversiones, crypto, inmuebles y vehículos.

A diferencia de apps de presupuesto como Buddy o YNAB que solo rastrean gastos, WealthOS es una herramienta de **wealth management personal** — no solo te dice en qué gastas, sino cuánto vales, cómo creces y dónde puedes poner tu dinero a trabajar.

**Mercado objetivo:** Profesionales dominicanos de 25–45 años con activos diversificados en DOP y USD.

**Modelo de negocio:** Freemium — 5 días de prueba gratuita, luego $5 USD/mes o plan anual.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Base de datos | PostgreSQL vía Supabase |
| Backend | Node.js + Express |
| Autenticación | JWT propio con bcrypt (NO Supabase Auth) |
| IA | Anthropic Claude API (stateless) |
| Pagos iOS | RevenueCat + StoreKit 2 |
| Crypto precios | CoinGecko API (gratis, sin key) |
| ETFs / Índices / Commodities | Twelve Data API (gratis, 800 req/día) |
| Tipo de cambio USD/DOP | ExchangeRate-API (gratis, 1500 req/mes) |
| Hosting | A definir (Railway, Render, o similar) |

---

## Autenticación — JWT propio

**Importante:** No se usa Supabase Auth. El sistema de auth es completamente propio.

### Flujo
1. Usuario se registra → backend hashea password con `bcrypt` (salt rounds: 12)
2. Usuario hace login → backend verifica hash → genera JWT
3. JWT payload: `{ usuario_id, email, iat, exp }`
4. JWT expira en 30 días
5. App guarda el JWT en el Keychain de iOS
6. Cada request incluye: `Authorization: Bearer <token>`
7. Middleware valida JWT y extrae `usuario_id` para todos los queries

### Regla de seguridad crítica
Todos los queries a la base de datos deben filtrar por `usuario_id` extraído del JWT. Nunca confiar en un `usuario_id` que venga en el body del request.

```javascript
// ✅ CORRECTO
const { usuario_id } = req.user; // del JWT middleware
db.query('SELECT * FROM activos WHERE usuario_id = $1', [usuario_id]);

// ❌ INCORRECTO — nunca hacer esto
const { usuario_id } = req.body;
db.query('SELECT * FROM activos WHERE usuario_id = $1', [usuario_id]);
```

---

## Estructura de la base de datos

### Tablas de datos del usuario (persistentes)

#### `usuarios`
Perfil del usuario. Sin campo `auth_id` (no usamos Supabase Auth).
```
usuario_id     BIGINT PK
nombre         TEXT
email          TEXT (unique, lowercase index)
password_hash  TEXT (bcrypt)
moneda_base    TEXT ('DOP' | 'USD') default 'DOP'
meta_financiera TEXT   -- ej: "Alcanzar RD$10M en 2028"
meta_monto     NUMERIC(15,2)
meta_fecha     DATE
creado_en      TIMESTAMPTZ
actualizado_en TIMESTAMPTZ
```

#### `suscripciones`
Una suscripción por usuario (UNIQUE en usuario_id).
```
suscripcion_id   BIGINT PK
usuario_id       BIGINT FK → usuarios
estado           ENUM('prueba', 'activa', 'vencida', 'cancelada')
plan             TEXT ('mensual' | 'anual')
precio_usd       NUMERIC(6,2) default 5.00
revenuecat_id    TEXT UNIQUE  -- ID del cliente en RevenueCat
apple_product_id TEXT         -- 'com.wealthos.mensual'
trial_inicio     TIMESTAMPTZ
trial_fin        TIMESTAMPTZ  -- trial_inicio + 5 días
periodo_inicio   TIMESTAMPTZ
periodo_fin      TIMESTAMPTZ
cancelado_en     TIMESTAMPTZ
```

#### `activos`
Los "bolsillos" financieros del usuario. Puede ser personal o de un espacio compartido.
```
activo_id          BIGINT PK
usuario_id         BIGINT FK → usuarios
espacio_id         BIGINT FK → espacios_compartidos (NULL = personal)
nombre             TEXT      -- "Apto. Naco", "BTC Wallet"
tipo               ENUM('efectivo','cuenta_bancaria','inversion','crypto','inmueble','vehiculo','otro')
institucion_nombre TEXT      -- texto libre: "BHD León", "Binance"
institucion_codigo TEXT      -- código para cruzar con API: "BHD_LEON"
moneda             TEXT ('DOP' | 'USD')
valor_actual       NUMERIC(15,2)
ticker_simbolo     TEXT      -- 'BTC', 'ETH', 'QQQ' — para consultar precio en API
```

#### `historial_valores_activos`
Snapshot diario del valor de cada activo. Tu backend inserta 1 registro por activo cada noche mediante un cron job. Sin esta tabla no puedes construir la gráfica de evolución patrimonial.
```
activo_id   BIGINT FK → activos  }
fecha       DATE                 } PK compuesta
valor       NUMERIC(15,2)
moneda      TEXT
```

#### `categorias`
Categorías de transacciones. `usuario_id NULL` = categoría del sistema visible para todos. Las del sistema ya están precargadas con SF Symbols de iOS.
```
categoria_id BIGINT PK
usuario_id   BIGINT FK → usuarios (NULL = sistema)
nombre       TEXT      -- "Salario", "Alimentación"
tipo         ENUM('ingreso', 'gasto', 'transferencia')
icono        TEXT      -- nombre del SF Symbol
color_hex    TEXT
es_sistema   BOOLEAN
```

Categorías del sistema precargadas:
- **Ingresos:** Salario, Negocio propio, Dividendos, Alquiler, Venta de activo, Freelance, Remesas, Otro ingreso
- **Gastos:** Alimentación, Transporte, Vivienda, Salud, Educación, Entretenimiento, Restaurantes, Viajes, Suscripciones, Servicios básicos, Seguros, Inversión, Otro gasto
- **Transferencias:** Entre mis cuentas, Envío de dinero

#### `transacciones`
Core de la app. Puede ser personal (`espacio_id NULL`) o de un espacio compartido.
```
transaccion_id         BIGINT PK
usuario_id             BIGINT FK → usuarios     -- quién la registró
espacio_id             BIGINT FK → espacios_compartidos (NULL = personal)
activo_id              BIGINT FK → activos (origen)
activo_destino_id      BIGINT FK → activos (solo en transferencias)
tipo                   ENUM('ingreso', 'gasto', 'transferencia')
monto                  NUMERIC(15,2)
moneda                 TEXT ('DOP' | 'USD')
tasa_cambio            NUMERIC(10,4)  -- tasa del momento, del cache
monto_dop              NUMERIC(15,2)  -- normalizado a DOP para reportes
categoria_id           BIGINT FK → categorias
descripcion            TEXT
fecha                  DATE
origen                 TEXT ('app' | 'widget' | 'siri_shortcut')
categoria_ia_sugerida  TEXT      -- resultado de Claude al registrar
categoria_ia_confianza NUMERIC(3,2) -- 0.00 a 1.00
```

#### `alertas`
Generadas por reglas del sistema o por Claude. El campo `espacio_id` permite alertas para todo un espacio compartido.
```
alerta_id   BIGINT PK
usuario_id  BIGINT FK → usuarios
espacio_id  BIGINT FK → espacios_compartidos (NULL = personal)
tipo        TEXT ('gasto_elevado'|'meta_progreso'|'oportunidad_inversion'|
                  'suscripcion_vence'|'tasa_cambio'|'ia_insight')
titulo      TEXT
cuerpo      TEXT
datos_extra JSONB
fue_leida   BOOLEAN default false
fue_enviada BOOLEAN default false  -- push notification
```

---

### Tablas de espacios compartidos

#### `espacios_compartidos`
Un espacio compartido es un "grupo financiero" — puede ser una pareja, familia, o socios. Tiene su propio flujo de transacciones y activos, visible para todos sus miembros.
```
espacio_id   BIGINT PK
nombre       TEXT  -- "Hogar", "Negocio con Juan"
descripcion  TEXT
creado_por   BIGINT FK → usuarios (ON DELETE RESTRICT)
```
`ON DELETE RESTRICT` en `creado_por` significa que no puedes borrar un usuario que creó un espacio. Primero debe transferir ownership o disolver el espacio.

#### `espacio_miembros`
PK compuesta `(espacio_id, usuario_id)` — no puede haber duplicados.
```
espacio_id  BIGINT FK → espacios_compartidos
usuario_id  BIGINT FK → usuarios
rol         TEXT ('admin' | 'miembro')
unido_en    TIMESTAMPTZ
```
- **admin:** puede invitar, remover miembros, editar el espacio, ver todo
- **miembro:** puede ver y registrar transacciones

Regla importante: cuando se crea un espacio, el creador se agrega automáticamente como `admin`.

#### `espacio_invitaciones`
El token se genera en Postgres con `gen_random_bytes(32)` — no en el backend.
```
invitacion_id  BIGINT PK
espacio_id     BIGINT FK → espacios_compartidos
invitado_por   BIGINT FK → usuarios
email_invitado TEXT
token          TEXT UNIQUE (64 chars hex)  -- para deep link
estado         TEXT ('pendiente'|'aceptada'|'rechazada'|'expirada')
expira_en      TIMESTAMPTZ  -- now() + 48 horas
```

#### Flujo de invitación
```
Admin crea invitación con email del invitado
          ↓
Backend genera registro en espacio_invitaciones
          ↓
Se envía notificación/email con deep link:
  wealthos://invitacion?token=<token>
          ↓
Invitado abre la app → acepta
          ↓
Backend verifica: token existe + no expirado + estado 'pendiente'
          ↓
INSERT en espacio_miembros + UPDATE estado a 'aceptada'
          ↓
Ambos ven el espacio en su dashboard
```

---

### Tablas de cache (APIs externas)

Estas tablas las llena el backend mediante cron jobs. Son `UNLOGGED` porque son reconstruibles llamando la API de nuevo si el servidor se cae.

**Regla:** Nunca hardcodear datos de APIs externas en el código. Siempre pasar por el cache.

#### `cache_tasas_cambio`
- **Fuente:** ExchangeRate-API
- **Frecuencia:** 2 veces al día
- **Uso:** Conversión USD/DOP al registrar transacciones
```
moneda_origen  TEXT }
moneda_destino TEXT } PK compuesta
tasa           NUMERIC(10,4)
fuente         TEXT
valido_hasta   TIMESTAMPTZ
```

#### `cache_precios_crypto`
- **Fuente:** CoinGecko API (sin API key)
- **Frecuencia:** Cada 5 minutos
- **Símbolos típicos:** BTC, ETH, USDT, SOL
```
simbolo        TEXT PK
nombre         TEXT
precio_usd     NUMERIC(20,8)
cambio_24h_pct NUMERIC(7,2)
actualizado_en TIMESTAMPTZ
```

#### `cache_precios_mercado`
- **Fuente:** Twelve Data API
- **Frecuencia:** Cada 15 minutos (solo en horario de mercado: 9:30am–4pm ET)
- **Símbolos:** QQQ, VOO, SPY (ETFs) | XAU/USD, XAG/USD (oro, plata)
```
simbolo        TEXT PK
nombre         TEXT
tipo           TEXT ('etf'|'indice'|'commodity'|'accion')
precio_usd     NUMERIC(20,4)
cambio_24h_pct NUMERIC(7,2)
actualizado_en TIMESTAMPTZ
```

#### `sync_log`
Registro de cada sincronización con APIs externas.
```
sync_id                BIGINT PK
fuente                 TEXT
tabla_cache            TEXT
registros_actualizados INTEGER
estado                 TEXT ('exitoso'|'error'|'parcial')
error_detalle          TEXT
iniciado_en            TIMESTAMPTZ
completado_en          TIMESTAMPTZ
```

---

## Integración con Claude (IA)

### Principio fundamental
Claude es una llamada **stateless** — no hay historial de conversación guardado en la base de datos. Cada llamada a Claude recibe el contexto completo del usuario en el prompt y responde. Punto.

### Dos usos concretos

#### 1. Categorización automática al registrar transacción
Cuando el usuario registra una transacción con descripción, el backend llama a Claude para sugerir la categoría antes de guardar.

```javascript
// Llamada a Claude para categorizar
const prompt = `
Eres un categorizador de transacciones financieras.
Dado el siguiente texto de una transacción, responde SOLO con un JSON:
{ "categoria": "<nombre>", "confianza": <0.0 a 1.0> }

Categorías disponibles: ${categorias.join(', ')}
Transacción: "${descripcion}"
`;
```

El resultado se guarda en `categoria_ia_sugerida` y `categoria_ia_confianza`. 
Si `confianza >= 0.85`, se asigna automáticamente. Si no, se le muestra al usuario como sugerencia.

#### 2. Asesor financiero personal (pantalla de IA)
El usuario puede hacerle preguntas a Claude sobre su portafolio. Cada pregunta incluye el contexto completo del usuario.

```javascript
const contextoUsuario = {
  patrimonio_total: 4827350,
  moneda_base: 'DOP',
  activos: [...],                    // lista de activos con valores
  flujo_ultimo_mes: {
    ingresos: 95000,
    gastos: 58000,
    ahorro: 37000
  },
  tasa_ahorro_pct: 38.9,
  precios_mercado: {                 // del cache
    BTC: { precio: 67500, cambio_24h: -2.1 },
    QQQ: { precio: 487.32, cambio_24h: 0.8 }
  },
  tasa_cambio_usd_dop: 60.25
};

const systemPrompt = `
Eres WealthOS AI, un asesor financiero personal experto en el mercado dominicano.
Respondes siempre en español, de forma clara y sin jerga innecesaria.
Tienes acceso al portafolio completo del usuario.
No guardas historial — cada mensaje es independiente.
No das consejos de inversión como promesas, siempre como recomendaciones informadas.
`;
```

### Lo que NO hace Claude
- No guarda conversaciones
- No tiene memoria entre sesiones
- No accede a APIs externas directamente
- No ejecuta código ni hace cálculos — solo analiza y recomienda

---

## Endpoints a construir

### Auth
```
POST /auth/registro          -- crea usuario + suscripción en estado 'prueba'
POST /auth/login             -- devuelve JWT
POST /auth/refresh           -- renueva JWT
POST /auth/cambiar-password
```

### Usuarios
```
GET    /usuario/perfil
PUT    /usuario/perfil
DELETE /usuario/cuenta       -- borrar cuenta y todos sus datos
```

### Suscripciones
```
GET  /suscripcion                        -- estado actual
POST /suscripcion/webhook/revenuecat     -- webhook de RevenueCat (pagos)
```

### Activos
```
GET    /activos                          -- todos los activos del usuario
GET    /activos/:id
POST   /activos                          -- crear activo
PUT    /activos/:id
DELETE /activos/:id
GET    /activos/:id/historial            -- historial de valores para gráfica
```

### Transacciones
```
GET    /transacciones                    -- con filtros: fecha, tipo, categoria, activo
GET    /transacciones/:id
POST   /transacciones                    -- registrar (llama Claude para categorizar)
PUT    /transacciones/:id
DELETE /transacciones/:id
```

### Dashboard
```
GET /dashboard                           -- resumen_portafolio + flujo del mes actual
GET /dashboard/insights                  -- flujo_mensual últimos 6 meses
```

### Categorías
```
GET    /categorias                       -- sistema + propias del usuario
POST   /categorias                       -- crear categoría propia
DELETE /categorias/:id                   -- solo las propias, no las del sistema
```

### Alertas
```
GET  /alertas                            -- no leídas primero
PUT  /alertas/:id/leer
PUT  /alertas/leer-todas
```

### Mercado (datos del cache)
```
GET /mercado/crypto                      -- precios de crypto del cache
GET /mercado/etfs                        -- precios de ETFs del cache
GET /mercado/tasa-cambio                 -- USD/DOP actual
```

### IA
```
POST /ia/preguntar                       -- pregunta al asesor, responde en streaming
POST /ia/categorizar                     -- categorización de transacción (uso interno)
```

### Espacios compartidos
```
GET    /espacios                         -- espacios del usuario
POST   /espacios                         -- crear espacio
GET    /espacios/:id
PUT    /espacios/:id                     -- solo admin
DELETE /espacios/:id                     -- solo admin, disuelve el espacio

GET    /espacios/:id/miembros
DELETE /espacios/:id/miembros/:usuario_id  -- remover miembro (solo admin)

POST   /espacios/:id/invitar             -- enviar invitación
GET    /invitaciones/:token              -- ver info de invitación
POST   /invitaciones/:token/aceptar
POST   /invitaciones/:token/rechazar

GET    /espacios/:id/transacciones       -- todas las transacciones del espacio
GET    /espacios/:id/activos             -- activos del espacio
GET    /espacios/:id/dashboard           -- resumen del espacio
```

---

## Cron Jobs

```
Cada 5 minutos  → sync_crypto()       -- CoinGecko → cache_precios_crypto
Cada 15 minutos → sync_mercado()      -- Twelve Data → cache_precios_mercado (solo lun-vie 9:30-16:00 ET)
2 veces al día  → sync_tasa_cambio()  -- ExchangeRate-API → cache_tasas_cambio
1 vez al día    → snapshot_activos()  -- valor actual de cada activo → historial_valores_activos
1 vez al día    → verificar_trials()  -- marcar suscripciones vencidas
1 vez al día    → expirar_invitaciones() -- marcar invitaciones expiradas
```

Cada cron job debe:
1. Llamar la API externa
2. Actualizar la tabla de cache
3. Insertar registro en `sync_log` con estado y cantidad de registros actualizados
4. Si falla, insertar en `sync_log` con estado `'error'` y el detalle del error

---

## Reglas de negocio importantes

### Suscripción
- Al registrarse, se crea automáticamente una suscripción en estado `'prueba'` con `trial_fin = now() + 5 días`
- Cuando `trial_fin` pasa y no hay pago, el estado cambia a `'vencida'`
- Usuario con suscripción `'vencida'` o `'cancelada'` puede ver sus datos pero no registrar nuevas transacciones
- RevenueCat envía webhooks cuando el usuario paga → actualizar estado a `'activa'`

### Espacios compartidos
- Para acceder a un espacio, el usuario debe ser miembro (`espacio_miembros`)
- El creador del espacio se agrega automáticamente como `admin` al crear
- Solo los `admin` pueden invitar, remover miembros y editar el espacio
- Si se elimina un espacio, se borran en cascada: miembros, invitaciones y alertas del espacio
- Las transacciones y activos del espacio quedan con `espacio_id = NULL` (SET NULL) — no se borran
- Mínimo debe haber 1 admin en el espacio en todo momento

### Transacciones
- `monto_dop` se calcula automáticamente al guardar si la moneda es USD: `monto * tasa_cambio`
- `tasa_cambio` se obtiene del `cache_tasas_cambio` en el momento del registro
- Si no hay tasa en cache, el registro falla con error descriptivo — nunca usar tasa 0 o null

### Activos con ticker
- Si un activo tiene `ticker_simbolo`, su `valor_actual` debe actualizarse cuando el usuario abre la app
- El precio viene del cache (crypto → `cache_precios_crypto`, ETF/commodity → `cache_precios_mercado`)
- El backend actualiza `valor_actual` del activo y guarda un snapshot en `historial_valores_activos`

---

## Variables de entorno necesarias

```env
# Base de datos
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=
JWT_EXPIRES_IN=30d

# APIs externas
TWELVE_DATA_API_KEY=
EXCHANGERATE_API_KEY=
# CoinGecko no necesita key para el tier gratuito

# Claude
ANTHROPIC_API_KEY=

# RevenueCat
REVENUECAT_WEBHOOK_SECRET=

# App
NODE_ENV=production
PORT=3000
```

---

## Convenciones de código

- Todo en **español** en la base de datos (nombres de tablas, columnas, valores de ENUMs)
- Todos los endpoints responden en **español** en los mensajes de error
- Formato de fechas: ISO 8601 (`2026-03-06T14:30:00Z`)
- Formato de montos: siempre como número, nunca como string
- Todos los endpoints protegidos requieren `Authorization: Bearer <token>`
- Respuestas exitosas: `{ data: {...} }`
- Respuestas de error: `{ error: { codigo: 'ACTIVO_NO_ENCONTRADO', mensaje: 'El activo no existe.' } }`
