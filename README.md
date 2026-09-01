# Portal DGF — Dirección General de Fiscalización

## Estructura del proyecto

```
dgf/
├── index.html                    ← Página principal (portal, login, panel admin)
├── buscador_permisos.html        ← Buscador de permisos (módulo público)
├── estadisticas_actas.html       ← Estadísticas de actas (módulo)
├── gestion_personal.html         ← Gestión de personal (módulo)
├── novedades_personal.html       ← Novedades de personal (módulo)
├── asignacion_zonas.html         ← Asignación de zonas (módulo)
├── relevamientos_operativos.html ← Relevamientos operativos (módulo)
├── personal-auth.js              ← Login compartido (Firebase Authentication)
├── personal-nav.js, personal-dominio.js, personal-datos.js, utils.js
├── firestore.rules               ← Reglas de acceso a Firestore (se despliega con firebase deploy)
├── migration-scripts/            ← Script de migración de usuarios (uso puntual, no se despliega)
├── config.js                     ← ⚠️ GENERADO — no subir al repo
├── generate-config.js            ← Lee .env y genera config.js
├── .env                          ← ⚠️ SECRETO — no subir al repo
├── .env.example                  ← Plantilla vacía (sí subir al repo)
├── .gitignore
└── README.md
```

---

## Setup inicial (primera vez)

### 1. Crear `.env`
```bash
cp .env.example .env
# Editá .env con los valores reales de tu proyecto Firebase
```

### 2. Generar `config.js`
```bash
node generate-config.js
```

### 3. Habilitar Firebase Authentication

En la consola de Firebase → Authentication → Sign-in method, habilitar el
proveedor **Email/Password**. El login del sitio sigue pidiendo "usuario" +
"contraseña" (no cambia para quien lo usa), pero por dentro autentica contra
Firebase Authentication — ver "Cómo funciona el sistema de usuarios" más
abajo.

### 4. Desplegar las reglas de Firestore

```bash
firebase deploy --only firestore:rules
```

`firestore.rules` (en la raíz del repo) exige estar logueado y tener el
módulo correspondiente habilitado para cada colección; sólo
`permisos_chunks`/`permisos_meta` quedan de lectura pública (el buscador es
público a propósito). No hace falta pegar nada a mano en la consola — el
archivo del repo es la fuente de verdad.

### 5. Crear el usuario admin inicial

El alta del primer admin se hace **a mano, una sola vez**, directamente
desde la consola de Firebase: Authentication → Add user, y un documento
`usuarios/{uid}` en Firestore (mismo `uid` que le asignó Authentication) con
`{ username, nombre, email, role: "admin", modulos: [], permisos: {} }`,
más un documento `login_lookup/{username} → { email }` para que el login
por "usuario" lo pueda resolver.

---

## Deploy en Firebase Hosting

### Instalar Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

### Inicializar el proyecto
```bash
cd tu-carpeta
firebase init hosting
```
- Seleccioná tu proyecto existente (`base-de-datos-permisos`)
- Public directory: `.` (punto, la carpeta actual)
- Single-page app: **No**
- Sobreescribir index.html: **No**

Esto crea `firebase.json` y `.firebaserc`.

### Configurar `firebase.json` para excluir `.env`

```json
{
  "hosting": {
    "public": ".",
    "ignore": [
      "firebase.json",
      ".env",
      ".env.example",
      "generate-config.js",
      "README.md",
      ".gitignore",
      "node_modules"
    ]
  }
}
```

### Deploy
```bash
# Primero regenerá config.js si cambiaste .env
node generate-config.js

# Luego desplegás
firebase deploy --only hosting
```

El sitio queda en: `https://base-de-datos-permisos.web.app`

---

## Cómo funciona el sistema de usuarios

El login usa **Firebase Authentication** (Email/Password) por debajo, pero
la pantalla sigue pidiendo "usuario" + "contraseña" como siempre:

- Cada usuario tiene un email real cargado (no se muestra en la UI salvo en
  el panel admin), guardado en una colección pública mínima
  `login_lookup/{usuario} → {email}` — sólo eso, nada de nombres ni roles.
- Al loguearse, el sitio resuelve "usuario" → email vía esa colección, y
  llama a Firebase Authentication con ese email + la contraseña tipeada.
  Firebase verifica la contraseña en sus propios servidores — nunca se
  compara ningún hash en el navegador ni se guarda una contraseña (ni su
  hash) en Firestore.
- El perfil de cada persona (`nombre`, `role`, `modulos`, `permisos`) vive en
  `usuarios/{uid}`, donde `uid` es el identificador que asigna Firebase
  Authentication (no el nombre de usuario).
- Sólo los usuarios con `role: "admin"` ven el panel de gestión de usuarios.
  Desde ahí se puede: crear usuarios, habilitar/deshabilitar módulos y nivel
  de permiso por módulo, mandar un email de restablecimiento de contraseña a
  otro usuario, y sacarle el acceso a alguien (elimina su perfil; la cuenta
  de Authentication en sí se borra a mano, cada tanto, desde la consola de
  Firebase — no hay backend propio para automatizar eso).
- Cada quien puede cambiar su propia contraseña desde el botón "🔑" del
  encabezado.
- Los cambios aplican de inmediato en **todos los navegadores**.

### Integraciones externas (scripts que escriben en Firestore)

Cualquier script fuera del sitio (por ejemplo, un Google Apps Script que
sincroniza datos automáticamente) necesita autenticarse igual que el sitio:
loguearse contra Firebase Authentication con un usuario/contraseña propios
(una cuenta de servicio, con sólo el módulo que necesita habilitado) y
mandar el `idToken` que devuelve el login como header
`Authorization: Bearer <idToken>` en cada llamada a la API de Firestore. Sin
eso, las reglas nuevas rechazan la escritura con "Missing or insufficient
permissions" — antes de esta migración, cualquiera podía escribir sin
loguearse.

---

## Agregar nuevos módulos

En `index.html`, dentro del array `MODULES`, sumá un objeto:

```js
{
  id: 'mi_modulo',
  icon: '📂',
  title: 'Nombre del módulo',
  desc: 'Descripción breve.',
  tag: 'Activo',
  roles: ['admin', 'viewer'],  // quién puede verlo
  url: 'mi_modulo.html',       // null si todavía no existe
},
```
