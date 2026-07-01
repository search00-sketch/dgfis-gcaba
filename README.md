# Portal DGF — Dirección General de Fiscalización

## Estructura del proyecto

```
dgf/
├── index.html              ← Página principal (portal con login)
├── buscador_permisos.html  ← Buscador de permisos (módulo)
├── config.js               ← ⚠️ GENERADO — no subir al repo
├── generate-config.js      ← Lee .env y genera config.js
├── .env                    ← ⚠️ SECRETO — no subir al repo
├── .env.example            ← Plantilla vacía (sí subir al repo)
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

### 3. Configurar Firestore — Reglas de seguridad

En la consola de Firebase → Firestore → Reglas, pegá esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Colección de permisos: cualquiera puede leer (buscador público interno)
    // Solo usuarios autenticados (via passHash correcto) pueden escribir
    match /permisos/{id} {
      allow read: if true;
      allow write: if false; // escritura solo desde el panel de carga autenticado
    }

    // Colección de usuarios: NADIE puede leer/escribir desde el cliente
    // EXCEPTO durante el login (el index.html lee un solo doc por username)
    match /usuarios/{username} {
      allow read: if true;   // necesario para verificar la contraseña en login
      allow write: if false; // ← IMPORTANTE: solo el admin escribe (ver nota abajo)
    }
  }
}
```

> **Nota importante sobre la colección `usuarios`:**
> Como el sitio es HTML estático sin backend, las escrituras (cambiar contraseñas,
> agregar usuarios) necesitan que `allow write: if true` temporalmente mientras
> usás el panel admin, o bien usar Firebase Admin SDK en un backend.
>
> **Opción recomendada para producción:** cambiá las reglas a `allow write: if true`
> solo mientras hacés cambios desde el panel, y volvelas a `if false` después.
> O mejor aún, usá Firebase Authentication en lugar de contraseñas manuales.
>
> **Para uso interno simple:** dejá `allow write: if true` en usuarios y
> confía en que la colección solo la conoce el equipo.

### 4. Crear el usuario admin inicial

La primera vez que abrís `index.html` con Firestore vacío, el código
detecta que no hay usuarios y crea automáticamente:

| Usuario   | Contraseña | Rol   |
|-----------|-----------|-------|
| srepetto  | Admin2024! | admin |

**Cambiá esa contraseña inmediatamente desde el panel de administración.**

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

- Los usuarios se guardan en la colección `usuarios` de Firestore.
- Las contraseñas se hashean con **SHA-256** en el navegador antes de guardarse.
  Nunca se guarda la contraseña en texto plano.
- El login lee el documento del usuario por su nombre y compara el hash.
- Solo `srepetto` (admin) ve el panel de gestión de usuarios.
- Desde ese panel se puede cambiar contraseñas, agregar y eliminar usuarios.
- Los cambios aplican de inmediato en **todos los navegadores**.

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
