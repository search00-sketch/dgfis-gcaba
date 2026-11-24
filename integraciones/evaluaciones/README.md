# Carga automática de Evaluaciones de desempeño (Power Automate → Firestore)

Lleva solo el Excel **"EVALUACIÓN DE DESEMPEÑO"** (SharePoint) al módulo
**⭐ Evaluaciones de desempeño** del portal, sin descargar ni subir nada a mano.

```
Recurrencia (cada 1 h)
   │
   ├─ 1. Ejecutar script  ── Office Script "Sincronizar evaluaciones al portal"
   │                          lee CARGAS NUEVAS + BASE y arma el cuerpo de la escritura
   ├─ 2. HTTP  Login portal ── Firebase Authentication (usuario de servicio) → idToken
   └─ 3. HTTP  Guardar      ── Firestore documents:commit (una sola escritura atómica)
```

- El script **sólo lee** el Excel; no escribe nada en él.
- Cada corrida **reemplaza** las evaluaciones y la BASE del portal con lo que
  tiene el Excel en ese momento (igual que la carga manual). El historial de
  cargas manuales del módulo se conserva.
- Si el Excel no cambió desde la corrida anterior, la versión de los datos es
  la misma y los navegadores **no vuelven a descargar** nada.
- Los datos que guarda son idénticos a los de la carga manual del módulo
  (mismo formato, mismo cruce con BASE, puntaje convertido a número).

---

## Paso 1 — Usuario de servicio en el portal

El flujo entra al portal como un usuario más (ver "Integraciones externas" en
el README principal). En **Portal → Panel de administración**:

1. Crear un usuario, por ejemplo `pa-evaluaciones`, con un email propio y una
   contraseña larga generada para esto (no la de una persona).
2. Habilitarle **sólo** el módulo **evaluaciones**, con permiso **editor**.

Sin el módulo habilitado o con permiso "sólo ver", Firestore rechaza la
escritura con `PERMISSION_DENIED`.

## Paso 2 — Office Script en el Excel

1. Abrir el Excel "EVALUACIÓN DE DESEMPEÑO" en el navegador (SharePoint).
2. Pestaña **Automatizar → Nuevo script**.
3. Borrar el contenido de ejemplo y pegar todo
   [`sincronizar-evaluaciones.ts`](sincronizar-evaluaciones.ts).
4. Guardarlo como **"Sincronizar evaluaciones al portal"**.
5. Probarlo con **Ejecutar**: en la salida tiene que mostrar `evaluaciones`,
   `agentesBase`, `desde`, `hasta` y `version`. Si falta una hoja o un
   encabezado, el script corta con un error claro y **no se escribe nada**.

Si se renombran las hojas o los encabezados (`Id`, `Hora de inicio`,
`INSPECTOR`, `PUNTAJE`, `DESEMPEÑO`, `APELLIDO Y NOMBRE`…), hay que ajustar las
constantes y las expresiones del principio del script.

## Paso 3 — Flujo de Power Automate

**Flujo de nube programado**, nombre sugerido *"Evaluaciones → Portal DGFIS"*.

### Disparador: Recurrencia
- Intervalo **1**, frecuencia **Hora** (o lo que haga falta; las evaluaciones
  se cargan unas pocas veces por día).
- Opcional: zona horaria *(UTC-03:00) Buenos Aires* y horas 7 a 22.

> Alternativa: disparador de Forms *"Cuando se envía una respuesta nueva"*.
> Ojo: el Excel de Forms puede tardar unos segundos en tener la fila nueva, así
> que conviene agregar una acción **Retraso** de 1–2 minutos antes del paso 1.

### 1. Ejecutar script (Excel Online (Business))
- **Ubicación**: el sitio de SharePoint del grupo de evaluación de desempeño.
- **Biblioteca de documentos**: Documentos.
- **Archivo**: `EVALUACIÓN DE DESEMPEÑO.xlsx`.
- **Script**: *Sincronizar evaluaciones al portal*.

### 2. HTTP — renombrarla **Login portal**
- **Método**: `POST`
- **URI**:
  ```
  https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=API_KEY
  ```
  `API_KEY` = el valor `apiKey` de `config.js` del portal (es la clave pública
  de la app web de Firebase, la misma que usa el sitio).
- **Encabezados**: `Content-Type` = `application/json`
- **Cuerpo**:
  ```json
  { "email": "EMAIL_DEL_USUARIO_DE_SERVICIO", "password": "CONTRASEÑA", "returnSecureToken": true }
  ```
- **Configuración** de la acción → activar **Entradas seguras** y **Salidas
  seguras** (para que la contraseña y el token no queden en el historial).

### 3. HTTP — renombrarla **Guardar en portal**
- **Método**: `POST`
- **URI**:
  ```
  https://firestore.googleapis.com/v1/projects/dgfis-gcaba/databases/(default)/documents:commit
  ```
- **Encabezados**:
  - `Content-Type` = `application/json`
  - `Authorization` = `Bearer @{body('Login_portal')?['idToken']}`
- **Cuerpo** (expresión):
  ```
  outputs('Ejecutar_script')?['body/result/cuerpo']
  ```
- **Configuración** → **Entradas seguras** activado.

> Los nombres `Login_portal` y `Ejecutar_script` dentro de las expresiones son
> los nombres de las acciones con espacios reemplazados por `_`. Si las
> llamaste distinto, ajustalos.

### (Opcional) 4. Aviso si falla
Rama paralela con **Configurar ejecución posterior → "ha fallado"** sobre
*Guardar en portal* → *Enviar un correo* / mensaje de Teams con
`body('Guardar_en_portal')`.

## Paso 4 — Verificar

1. **Probar → Manualmente** en el flujo. Las tres acciones tienen que quedar en
   verde; *Guardar en portal* devuelve `200` con `writeResults`.
2. Abrir el módulo en el portal → **⟳ Actualizar**. La barra de arriba dice
   *"sincronizado automáticamente dd/mm hh:mm"* y la pestaña **Cargar Excel**
   muestra *"Última sincronización automática (Power Automate)"*.

## Errores comunes

| Dónde | Error | Causa / solución |
|---|---|---|
| Ejecutar script | `No existe la hoja "CARGAS NUEVAS"` / `no encontré los encabezados` | Se renombró una hoja o columna en el Excel. Corregir el Excel o las constantes del script. |
| Ejecutar script | `no tiene evaluaciones` | La hoja quedó vacía: el script corta a propósito para no vaciar el portal. |
| Login portal | `400 INVALID_LOGIN_CREDENTIALS` | Email o contraseña del usuario de servicio mal escritos. |
| Login portal | `400 API key not valid` | La `key=` de la URI no es el `apiKey` de `config.js`. |
| Guardar en portal | `403 PERMISSION_DENIED` | El usuario de servicio no tiene el módulo **evaluaciones** o lo tiene en "sólo ver"; o su perfil no existe en `usuarios/`. |
| Guardar en portal | `401 UNAUTHENTICATED` | Falta el encabezado `Authorization: Bearer …` o la expresión del token apunta a otra acción. |
| Guardar en portal | `400 … Invalid JSON payload` | El cuerpo no es la salida `cuerpo` del script (quedó el objeto entero o texto agregado). |
| Guardar en portal | `403` mencionando **App Check** | Si algún día se activa la aplicación obligatoria de App Check en Firestore, las llamadas REST sin token de App Check se rechazan: habría que registrar un token de depuración para el flujo. |

## Qué escribe (para quien mantenga el portal)

Un `documents:commit` con:

- `evaluaciones_chunks/eval_0..N` → `{n, datos: '[…evaluaciones…]', actualizadoEn}` (≈450 000 caracteres por documento)
- `evaluaciones_chunks/base` → `{n, datos: '[…agentes…]', actualizadoEn}`
- borra `eval_N+1 … eval_N+10` por si antes había más documentos
- `evaluaciones_meta/index` con `updateMask` (no toca `cargas`): `chunks, count, baseCount, v, primeraFecha, ultimaFecha, archivo, actualizadoEn, actualizadoPor = "Power Automate", ultimaAuto`

`v = "auto-" + hash del contenido`. El módulo usa `v` para su caché local.
