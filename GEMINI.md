# FinanceApp Backend - GEMINI.md

Este archivo proporciona contexto y pautas para trabajar en el backend de **FinanceApp**, una aplicación de gestión de finanzas personales y compartidas.

## 🚀 Descripción del Proyecto

FinanceApp Backend es una API REST construida con **Node.js** y **TypeScript**. Permite a los usuarios gestionar transacciones, presupuestos, categorías, activos (wallets) y espacios compartidos para finanzas colaborativas.

### Tecnologías Principales
- **Framework**: Express.js
- **Lenguaje**: TypeScript
- **Base de Datos**: PostgreSQL (gestionada a través de Supabase)
- **Acceso a Datos**: Supabase Client (PostgREST) para lógica de negocio; Prisma para documentación del esquema y migraciones.
- **Validación**: Zod
- **Autenticación**: JWT (JSON Web Tokens) con Bcrypt para hashing de contraseñas.
- **Documentación**: OpenAPI 3.0 (Swagger) expuesta en `/docs`.

---

## 🏗️ Arquitectura y Estructura

El proyecto sigue un patrón de diseño **Controller-Service-Route**:

- `src/controllers/`: Manejan las solicitudes HTTP, validan parámetros de entrada y llaman a los servicios.
- `src/services/`: Contienen la lógica de negocio y las llamadas a la base de datos (vía Supabase).
- `src/routes/`: Definen los endpoints de la API y asocian middleware (como `authMiddleware`).
- `src/middleware/`: Middlewares globales y específicos (autenticación, manejo de errores, CORS).
- `src/types/`: Definiciones de tipos TypeScript e interfaces.
- `src/utils/`: Funciones de utilidad (JWT, errores personalizados).
- `src/config/`: Configuración de entorno y clientes externos (Supabase).
- `docs/`: Contiene la especificación `openapi.yaml`.
- `prisma/`: Esquema de la base de datos para referencia y migraciones.

---

## 🛠️ Comandos Clave

| Comando | Descripción |
| :--- | :--- |
| `npm install` | Instala las dependencias del proyecto. |
| `npm run dev` | Inicia el servidor en modo desarrollo con `nodemon` y `ts-node`. |
| `npm run build` | Compila el código TypeScript a JavaScript en la carpeta `dist/`. |
| `npm start` | Ejecuta la versión compilada del proyecto. |

---

## ⚙️ Configuración del Entorno

El archivo `.env` es requerido para la ejecución. Las variables principales son:

- `PORT`: Puerto donde corre el servidor (default: 3000).
- `JWT_SECRET`: Secreto para firmar los tokens de acceso.
- `JWT_EXPIRES_IN`: Tiempo de expiración del access token (default: 24h).
- `SUPABASE_URL`: URL del proyecto de Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: Clave de servicio de Supabase (bypass RLS).
- `DATABASE_URL`: URL de conexión a PostgreSQL (usada por Prisma).
- `BCRYPT_ROUNDS`: Rondas de sal para bcrypt (default: 12).

---

## 📝 Convenciones de Desarrollo

1.  **Tipado Estricto**: Se debe usar TypeScript en todo el proyecto. Evitar el uso de `any` siempre que sea posible.
2.  **Validación de Datos**: Usar `zod` dentro de los servicios o controladores para validar los datos de entrada.
3.  **Manejo de Errores**: Usar las clases de error en `src/utils/errors.ts` y lanzarlas. El `errorHandler` middleware se encargará de formatear la respuesta.
4.  **Base de Datos**: Aunque existe un `schema.prisma`, las consultas en el código se realizan actualmente mediante `getSupabaseClient()`.
5.  **Serialización BigInt**: La API convierte automáticamente los tipos `BigInt` de Postgres a `Number` en las respuestas JSON (configurado en `src/index.ts`).
6.  **Documentación**: Mantener actualizado el archivo `docs/openapi.yaml` al agregar o modificar endpoints.

---

## 🔍 Endpoints Principales

- `/auth`: Registro, login y gestión de tokens.
- `/transactions`: Gestión de ingresos, gastos y transferencias.
- `/budgets`: Configuración de presupuestos mensuales/periodicos.
- `/wallets`: Gestión de cuentas, deudas y activos.
- `/categories`: Categorías de transacciones.
- `/spaces`: Gestión de finanzas compartidas.
- `/dashboard`: Resúmenes y estados financieros globales.
- `/docs`: Documentación interactiva Swagger.
