# Migración de login a Firebase Authentication + reglas de Firestore restrictivas

**Fecha:** 2026-08-26
**Páginas afectadas:** `index.html`, `buscador_permisos.html`, `estadisticas_actas.html`,
`gestion_personal.html`, `novedades_personal.html`, `asignacion_zonas.html`,
`relevamientos_operativos.html`
**Otros archivos:** `firestore.rules`, `personal-auth.js` (se reemplaza por un módulo
nuevo compartido por las 6 páginas), script de migración de un solo uso (no se
publica, no forma parte del sitio)

## Contexto

Una auditoría de seguridad de todo el sitio encontró que `firestore.rules` tiene
`allow read, write: if true` en **todas** las colecciones, sin ningún chequeo de
autenticación — porque el sitio nunca usó Firebase Authentication: el login es
casero, comparando en el navegador un hash SHA-256 sin sal contra un documento
`usuarios/{username}` que cualquiera puede leer (y escribir) sin loguearse. En la
práctica, cualquiera con la URL del sitio puede leer o borrar nómina, novedades,
actas, permisos y relevamientos, o escribirse a sí mismo `role: "admin"`, sin saber
ninguna contraseña.

La auditoría también encontró que esta lógica de login está **triplicada** con
variantes (`index.html` propia, `buscador_permisos.html` propia, y
`personal-auth.js` compartido por las otras cuatro páginas), y que
`estadisticas_actas.html` no tiene ningún login propio — es accesible directo por
URL sin pedir nada, a pesar de estar listada como módulo restringido
(`roles:['admin','estadisticas']`) en el portal.

## Objetivo

Login real y seguro que mantenga la experiencia actual de "usuario + contraseña"
(nadie tiene que aprender un flujo nuevo ni cambiar su contraseña), y reglas de
Firestore que efectivamente restrinjan el acceso a los datos según rol y módulo —
sin agregar un backend propio (Cloud Functions) ni pasar al plan pago de Firebase.

## Alcance

- Migrar todas las cuentas existentes de `usuarios` a Firebase Authentication,
  preservando su contraseña actual (nadie tiene que resetearla).
- Reescribir el login de las 6 páginas para usar Firebase Authentication, en un
  único módulo compartido (reemplaza las tres implementaciones actuales).
- Agregarle login a `estadisticas_actas.html`, que hoy no tiene ninguno.
- Reescribir `firestore.rules` para que cada colección exija estar logueado y
  tener el módulo/rol correspondiente, igual que hoy lo exige (sólo en el
  navegador) `personal-auth.js`.
- Adaptar el panel de administración de usuarios (`index.html`) a las
  operaciones que sí se pueden hacer desde el navegador sin backend: crear
  usuario, dar de baja acceso, cambiar mi propia contraseña, y enviar un email
  de restablecimiento a otro usuario.

## Fuera de alcance

- No se agregan Cloud Functions ni se pasa al plan Blaze — decisión explícita
  del equipo. Como consecuencia, "cambiar la contraseña de otro usuario" pasa
  a ser "enviarle un email para que la restablezca él mismo" (ver más abajo),
  y "eliminar usuario" no borra la cuenta de Firebase Authentication en sí,
  sólo le saca el acceso; el borrado completo de la cuenta se hace a mano y
  de vez en cuando desde la consola de Firebase.
- No se agrega verificación de email (`email_verified`) ni ningún flujo de
  confirmación de cuenta — el email sirve solo como identificador técnico
  para Firebase Auth y como destino del email de restablecimiento, nunca se
  usa para loguearse ni se muestra en la UI salvo en el panel admin.
- No cambia el modelo de roles/módulos/permisos (`role`, `modulos`,
  `permisos`) ni cómo se usan en la UI — se preservan tal cual están hoy.
- No se toca el contenido de nómina, novedades, actas, permisos ni
  relevamientos — este trabajo cambia únicamente cómo se autentica y quién
  puede acceder a esos datos, no los datos en sí.
- No se arreglan en esta tanda los demás hallazgos de la auditoría que no son
  de autenticación (XSS puntuales, condiciones de carrera en `permisos_chunks`
  /`actas_chunks`/zonas-feriados-eventos, bugs de importación, etc.) — quedan
  para una etapa posterior.

## Diseño

### Modelo de datos nuevo

- **`usuarios/{uid}`** — el id del documento pasa a ser el UID que asigna
  Firebase Authentication (hoy es el nombre de usuario). Campos:
  `username` (para mostrar en auditoría/UI, igual que hoy), `nombre`, `email`,
  `role` (`'admin'` | `'viewer'`), `modulos` (array de ids de módulo),
  `permisos` (mapa `{moduloId: 'viewer'|'editor'}`). Ya no tiene `passHash` —
  la contraseña la maneja Firebase Auth, nunca vive en Firestore.
- **`login_lookup/{username}`** — colección nueva, mínima: un solo campo
  `email`. Existe porque el login sigue pidiendo "usuario", pero Firebase Auth
  necesita un email para autenticar; esta colección resuelve usuario→email
  *antes* de loguearse, así que tiene que ser de lectura pública. No expone
  nada más (ni nombre, ni rol, ni contraseña) — es un mapeo bastante inocuo
  comparado con la exposición total que hay hoy.
- Los documentos viejos `usuarios/{username}` (colección actual) **no se
  borran** durante la migración — quedan de respaldo de sólo lectura hasta
  confirmar que el sistema nuevo funciona con cuentas reales, y se eliminan
  en un paso aparte al final, ya con las reglas nuevas funcionando.

### Script de migración (un solo uso, corre local, no se publica)

Un script Node.js que usa el Admin SDK de Firebase con una clave de cuenta de
servicio. Por cada documento en `usuarios` (colección vieja):

1. Importa el usuario a Firebase Authentication preservando el hash SHA-256
   actual como contraseña (Firebase Admin SDK soporta importar usuarios con
   un hash ya calculado, sin que nadie tenga que volver a escribir su
   contraseña) y el email real correspondiente.
2. Una vez creada la cuenta, obtiene el `uid` que le asignó Firebase y escribe
   `usuarios/{uid}` con el perfil (username, nombre, email, role, modulos,
   permisos) y `login_lookup/{username}` con el email.

Es un proceso de solo-agregar: sólo lee de la colección vieja y escribe
documentos nuevos; no modifica ni borra nada existente. Se puede correr de
nuevo sin problema si hace falta (por ejemplo, saltando los usuarios que ya
se importaron antes). Antes de correrlo contra las cuentas reales, se prueba
con una cuenta de prueba descartable.

**Insumo que hace falta de tu parte:** la lista de usuario→email real de cada
persona (para el paso 1) y la clave de cuenta de servicio (Project Settings →
Service Accounts → Generate new private key, en la consola de Firebase) —
se usa sólo para correr este script una vez y después se borra.

### Flujo de login nuevo (las 6 páginas)

Módulo nuevo compartido (reemplaza `personal-auth.js` y las dos
implementaciones propias de `index.html` y `buscador_permisos.html`):

1. El usuario tipea "usuario" + "contraseña", igual que hoy.
2. La página busca `login_lookup/{usuario}` para obtener el email real.
3. Llama a `signInWithEmailAndPassword(auth, email, password)` (Firebase
   Authentication verifica la contraseña en sus propios servidores — nunca
   se compara ningún hash en el navegador).
4. Con la sesión iniciada, lee `usuarios/{uid}` para obtener nombre, rol,
   módulos y permisos, y arma el mismo objeto `loggedUser` que usa hoy el
   resto del código de cada página (misma forma, mismos campos) — así el
   resto de la lógica de cada página (chequeos de `role==='admin'`,
   `modulos.includes(...)`, `permisos[...]==='viewer'`) no cambia.
5. La sesión persiste sola entre recargas vía `onAuthStateChanged` de
   Firebase (reemplaza el cacheo manual actual en `localStorage`).

`estadisticas_actas.html` recibe este mismo login por primera vez (hoy no
tiene ninguno).

### Panel de administración — qué cambia

- **Crear usuario**: mismo formulario (usuario, nombre, contraseña, rol) +
  campo nuevo de email real. Por dentro usa una instancia secundaria de
  Firebase en el navegador para crear la cuenta de otra persona sin cerrar
  la sesión del admin que la está creando (es el patrón estándar de Firebase
  para este caso, no hace falta backend).
- **Cambiar contraseña de otro usuario**: el botón pasa a decir "Enviar link
  de restablecimiento" — dispara `sendPasswordResetEmail(auth, email)` al
  email real de esa persona. No requiere permisos especiales del lado de
  Firebase (es una llamada estándar del SDK cliente), así que sigue
  funcionando igual de simple para el admin, solo cambia qué hace el botón.
- **Eliminar usuario**: borra `usuarios/{uid}` — sin ese documento, las
  reglas nuevas le niegan todo acceso a esa persona al instante (mismo
  mensaje que ya existe hoy: "usuario ya no existe"). La cuenta de
  Authentication en sí queda inactiva; se borra del todo cada tanto a mano
  desde la consola de Firebase (Authentication → Users).
- **Cambiar mi propia contraseña**: mismo modal de hoy, por dentro usa
  `reauthenticateWithCredential` + `updatePassword` de Firebase Auth en vez
  de comparar hashes a mano.
- **Habilitar/deshabilitar módulo, cambiar nivel de permiso**: sin cambios —
  siguen siendo `updateDoc` directos sobre `usuarios/{uid}` (ahora protegidos
  también por las reglas nuevas, no sólo por la UI).

### Reglas de Firestore nuevas

Reemplazan el `allow read, write: if true` actual por funciones que leen el
perfil del usuario logueado y replican en el servidor los mismos chequeos que
hoy sólo existen en el navegador (`role==='admin'`, `modulos.includes(...)`,
`permisos[modulo]!=='viewer'`), aplicadas por colección según a qué módulo
del portal pertenece cada una (nómina/novedades/asignaciones → módulo
`personal`/`novedades`/`asignacion`; `permisos_chunks` → módulo `permisos`;
`actas_chunks` → módulo `estadisticas`; `relevamientos_*` → módulo
`relevamientos`; `usuarios` y `login_lookup` con sus propias reglas ya
descritas arriba). El detalle línea por línea de las reglas se termina de
definir en el plan de implementación, escribiéndolas junto con los tests /
casos de prueba manual de cada colección.

### Consolidación de código

Las tres implementaciones de login actuales (`index.html` propia,
`buscador_permisos.html` propia, `personal-auth.js` compartido) se
reemplazan por un solo módulo nuevo que usan las 6 páginas — mismo criterio
que ya se usó para `utils.js` (una sola versión de `esc()` en vez de cinco
copias).

## Plan de despliegue (para no romper nada en el camino)

1. Escribir el código nuevo (módulo de login, cambios en las 6 páginas,
   `firestore.rules` nuevas) sin publicar nada todavía.
2. Correr el script de migración. No afecta el sitio publicado en absoluto —
   todavía corre con el sistema de login viejo.
3. Publicar el código nuevo en Hosting. En este punto **las reglas de
   Firestore siguen siendo las viejas** (abiertas), así que si algo del login
   nuevo falla para alguien, el resto del sitio sigue funcionando mientras se
   corrige.
4. Probar el login nuevo con cuentas reales (verificar que cada persona
   puede entrar con su usuario y contraseña de siempre).
5. Recién ahí, publicar las reglas de Firestore nuevas — es el único paso
   que podría bloquear acceso si algo quedó mal configurado, y es
   instantáneo de revertir (la versión vieja de `firestore.rules` queda en
   git; alcanza con volver a publicarla).
6. Una vez confirmado que todo funciona con las reglas nuevas puestas,
   borrar los documentos viejos `usuarios/{username}` (colección vieja) y
   los que ya no se necesiten.

Cada publicación a Hosting o a Firestore (pasos 3, 5 y 6) se confirma con vos
antes de ejecutarse.

## Pasos que tenés que hacer vos

- Habilitar el proveedor **Email/Password** en Firebase Authentication
  (consola de Firebase → Authentication → Sign-in method) — no tengo acceso
  a la consola.
- Generar y pasarme una **clave de cuenta de servicio** (Project Settings →
  Service Accounts → Generate new private key) para correr el script de
  migración una sola vez. Te aviso cuando ya no la necesito más para que la
  borres/revoques.
- Pasarme la lista de **usuario → email real** de cada cuenta existente.
- Confirmar cada paso de publicación (3, 5 y 6 del plan de despliegue de
  arriba) antes de que lo ejecute.

## Riesgos y mitigaciones

- **Un usuario real no puede loguearse después de migrar** (email mal
  cargado, hash no compatible, etc.) → se prueba primero con una cuenta de
  prueba descartable, y luego con al menos una cuenta real de cada rol antes
  del paso 5 (reglas nuevas). Mientras las reglas sigan siendo las viejas
  (pasos 3-4), el sistema de login viejo sigue disponible como respaldo.
- **Reglas nuevas mal escritas bloquean a todo el mundo** → se revierte
  publicando de nuevo el `firestore.rules` viejo (queda en git), efecto
  inmediato.
- **La clave de cuenta de servicio es una credencial sensible** → se usa
  sólo localmente para el script de migración, nunca se commitea ni se sube
  a ningún lado, y se borra/revoca apenas termina la migración.
- **El panel admin pierde la capacidad de "forzar" una contraseña nueva a
  otro usuario sin que esa persona haga nada** → aceptado como trade-off
  explícito para no necesitar Cloud Functions/Blaze (ver "Fuera de
  alcance"). Si en el futuro se necesita recuperar esa capacidad, el camino
  es pasar a Blaze y agregar una Cloud Function admin-only.

## Testing / verificación

- Migración probada primero con una cuenta descartable antes de tocar
  cuentas reales.
- Login verificado con al menos una cuenta real de cada rol (`admin` y
  `viewer`) y, si hay usuarios con `permisos` de tipo `viewer` en algún
  módulo específico, también esa combinación.
- Verificar que `estadisticas_actas.html` ahora sí pide login.
- Con las reglas nuevas puestas: confirmar que un usuario sin el módulo
  correspondiente no puede leer esa colección directamente (probar contra la
  API de Firestore, no sólo contra la UI que ya lo ocultaba antes).
- Confirmar que "crear usuario", "enviar restablecimiento", "eliminar
  usuario", "cambiar mi contraseña", "habilitar módulo" y "cambiar permiso"
  funcionan de punta a punta en el panel admin.
