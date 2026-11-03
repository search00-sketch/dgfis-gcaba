# Pruebas de rendimiento

Comparan en Chromium (Playwright) la versión de referencia (`REF`, por
defecto `origin/main`) contra el código actual del repo. No se despliegan
(`firebase.json` excluye `pruebas/**`).

```bash
./correr.sh simulado   # datos sintéticos (570 personas, 10.000 novedades…), Firebase simulado
./correr.sh buscador   # Firestore REAL, Buscador de permisos (público, sin login)
./correr.sh personal   # Firestore REAL con login: Asignación, Novedades, Gestión, Estadísticas
```

`personal` necesita las variables de entorno `DGF_TEST_USER` / `DGF_TEST_PASS`
de un usuario con esos módulos en **"Sólo ver"** (hoy: `prueba_rendimiento`).
Nunca poner la contraseña en un archivo ni en el chat: va en las variables
de entorno del entorno de ejecución.

Seguridad de las pruebas reales: sólo leen. Además de que el usuario es de
sólo lectura (las reglas de Firestore rechazan sus escrituras), `real.js`
bloquea a nivel de red toda escritura a Firestore y la reporta.

Las páginas se sirven desde los archivos locales bajo el dominio
`dgfis-gcaba.web.app` (sólo dentro del navegador de prueba). Único desvío de
producción: App Check se reemplaza por un módulo vacío, porque reCAPTCHA no
está disponible en el entorno de pruebas (la base hoy no lo exige).
