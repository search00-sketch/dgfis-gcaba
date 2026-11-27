# Personas (módulo nuevo, en paralelo)

Ficha única por persona, clave **DNI** (o el DNI que sale del CUIL/CUIT), con
categorías (Inspector, **Chofer**…), vehículo asignado, talonarios de actas y
la última acta labrada. Vive en `/personas/` y **no modifica** la nómina, las
novedades, las zonas ni las actas actuales: sólo las lee.

## Estructura (una carpeta, sin archivos gigantes)

| Archivo | Qué hace |
|---|---|
| `index.html` | Cáscara: login (el de siempre, `../personal-auth.js`), pestañas y modales vacíos |
| `app.js` | Arranque: sesión, carga de datos, pestañas con carga diferida (`import()`) |
| `firebase.js` | Inicialización de Firebase, una sola vez |
| `chunks.js` | Colección en chunks **genérica** (el esquema `X_meta` + `X_chunks` del portal, en un solo lugar) |
| `store.js` | Estado en memoria + guardado; las pestañas se redibujan con `alCambiar()` |
| `logica.js` | Lógica pura (DNI/CUIL, fusión de duplicados, talonarios, patentes). Se prueba en Node |
| `tab-personas.js`, `tab-talonarios.js`, `tab-vehiculos.js`, `tab-importar.js` | Una pestaña cada una; se bajan al abrirla |
| `dom.js`, `app.css` | Ayudas de DOM y estilos propios |

Probar la lógica: `node pruebas/personas/probar.mjs [backup.json]`

## Datos (Firestore)

- `personas_meta/index` + `personas_chunks/chunk_N` → `registros.{dni}` (300 por chunk)
- `personas_sensibles/{dni}` → CBU, IMEI, emergencia, nacimiento (**sólo admin**)
- `personas_config/vehiculos` → `{items:{id:{…}}}` (lista corta)
- `personas_tal_meta` + `personas_tal_chunks/chunk_N` → talonarios (cientos; en chunks para no acercarse al tope de un documento)
- Lee, sin escribir: `actas_chunks`/`actas_meta` (última acta) y `nomina_chunks` (importación inicial)

Reglas: bloque agregado al final de `firestore.rules`. Módulo de acceso: `personas`
(se habilita por usuario desde el panel de administración del portal).

## Talonarios

Un talonario = tipo (secuestro / comprobación / intimación) + rango `desde–hasta` + persona + fecha de entrega.
De **intimación** no hay fuente en las actas del portal: se registra el talonario pero no se calcula la última acta.

**Importar la planilla `ACTAS 2026.xlsx`** (pestaña Talonarios): lee las hojas *Actas secuestro*, *Actas comprobacion* y
*Actas Intimacion*; asocia cada fila a la persona por el CUIT (su DNI); del texto de cada celda toma el número y deja el
resto como nota ("entregado a legales", "extravió"…). De cada persona queda activo sólo el último talonario, salvo que su
nota indique cierre. Es repetible: el id es `tipo-desde-hasta`, así que reimportar actualiza y no duplica, y conserva el
estado que se haya cambiado a mano. Las hojas de bajas y "actas para denunciar" no se importan todavía.
Opcional: cantidad de dígitos del número, porque hay series que se solapan en valor (5, 7 y 8 dígitos).
Se calcula con las actas cargadas: usadas, restantes, **última acta labrada (número y fecha)**,
números saltados, repetidos y actas del rango escritas por otra persona.

## Para sumarlo al portal (no hecho a propósito)

Hoy se entra por `/personas/`. Para que aparezca como tarjeta hay que agregar una entrada a `MODULES`
en `index.html` (y, si se quiere, al menú de `personal-nav.js`).
