# Neural Co - AML MVP

Demo funcional de una plataforma AML / PLAFT basada en la propuesta para Payway. Incluye gestion de casos, motor de alertas y segmentacion en un monorepo independiente. Interfaz en castellano con identidad Neural Co.

## Ejecutar en Windows

Requisitos: Python 3.12+ y Node.js 20.19+ (o 22.12+).

Desde la raiz del repositorio, en PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
cd frontend
npm.cmd ci
cd ..
```

Abrir dos terminales en la raiz del repositorio:

```powershell
# Terminal 1: backend
.\.venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8001
```

```powershell
# Terminal 2: frontend
cd frontend
npm.cmd run dev -- --strictPort
```

Abrir http://127.0.0.1:5174. API y documentacion interactiva: http://127.0.0.1:8001/docs.
El frontend usa `/api` mediante proxy Vite al puerto 8001; abrir el HTML directamente no funciona.

En Linux/macOS usar `.venv/bin/python`, `npm` y rutas con `/`.

## Recorrido recomendado

1. Abrir Resumen para ver cartera, embudo y casos prioritarios.
2. En Gestion de casos, elegir **Tomar siguiente**. Abrir el caso, pasar a En analisis, comentar y enviar a En revision.
3. Cambiar el usuario demo a Sofia Ruiz para resolver la revision. Completar el registro inusual y remitir a Cumplimiento.
4. Preparar un borrador de ROS como Sofia. Cambiar a Oficial de Cumplimiento para aprobarlo. La demo no envia reportes a UIF.
5. Abrir Entidades y seleccionar una razon social: ficha 360, jerarquia, relaciones compartidas, transacciones, documentos sinteticos, comparacion y seguimiento.
6. En Motor de alertas crear una regla, simularla en el rango de datos y solicitar aprobacion. Cambiar a un supervisor distinto del autor para activar. Ejecutar motor para generar casos; repetirlo en el mismo dia no duplica alertas de la misma regla/entidad.
7. Una regla en sombra registra coincidencias en la ejecucion sin crear casos. La restauracion de una version anterior vuelve a borrador y exige nueva simulacion/aprobacion.
8. Ejecutar Screening como supervisor, resolver coincidencias con motivo y volver a correr. Un falso positivo no reaparece para la misma version de entrada. Actualizar una lista demo y correr nuevamente para ver la reevaluacion.
9. En Segmentacion ajustar pesos (suma 100), umbrales y agregacion; guardar y recalcular. Equipo y auditoria permite configurar la cola, delegar casos y consultar el historial.

## Datos y arquitectura

- React + TypeScript + Vite; iconos Lucide; logo local en SVG.
- FastAPI + Pydantic; SQLite en `backend/aml.db`.
- 6.000 transacciones sinteticas en 180 dias; 32 establecimientos, cuatro negocios, 18 casos iniciales y siete reglas.
- CUIT → establecimiento → subcliente. Los nombres y CBU son ficticios; las tarjetas se representan por tokens.
- Reglas con condiciones AND estructuradas. No hay evaluacion de codigo Python o SQL ingresado por usuarios.
- Simulacion por ventanas contiguas de N dias dentro del periodo solicitado; cuenta entidades unicas alcanzadas, no fraude capturado. No es un motor de ventanas moviles de produccion.
- Modelo de riesgo ilustrativo; no reproduce el modelo vigente de Payway porque no fue adjuntado. La ponderacion agregada usa perfil declarado como proxy del volumen.
- Persistencia MVP: un documento JSON transaccional en SQLite, serializado con `BEGIN IMMEDIATE`. Adecuado para demo pequena; requiere modelo relacional PostgreSQL para escalar.
- Auditoria append-only desde la API y encadenada por hash. No equivale a almacenamiento inmutable ni garantiza retencion de diez anos.
- Exportaciones reales `.xlsx` y PDF; las grillas aplican los filtros de busqueda, negocio, estado y riesgo. Los comentarios se escapan antes de generar PDF; Excel neutraliza prefijos de formulas.
- Adjuntos PDF/PNG/JPG/TXT hasta 2 MB, guardados en el documento local y descargables. No hay OCR ni busqueda dentro del contenido.

## Limites de la demo

La seleccion de usuario y el header `X-User` permiten probar roles, pero NO constituyen autenticacion. Ejecutar en localhost, con datos sinteticos. Antes de exponer a un equipo por Internet se requiere SSO/OIDC, autorizacion vinculada a sesion, aislamiento de datos, TLS y gestion de secretos. El proxy del servidor de desarrollo no es un despliegue productivo.

Los relojes 24 horas / 90 dias son parametros de la propuesta y estan configurables. El plazo mostrado es el menor entre el limite desde la operacion mas antigua y el limite desde la remision a Cumplimiento. No se implementa un calendario normativo oficial. Los nueve campos del registro son una estructura de demostracion que debe validar Cumplimiento; no certifica adecuacion al articulo citado en la propuesta.

RePET/OFAC/PEP usan entradas sinteticas. No se descargan listas oficiales, no hay jobs diarios ni screening de alta integrado con sistemas reales. Las coincidencias confirmadas quedan registradas para analisis y no bloquean transacciones.

Ver [docs/alcance.md](docs/alcance.md) para la correspondencia detallada con la propuesta, las simplificaciones y pendientes.

## Pruebas

```powershell
cd backend
..\.venv\Scripts\python.exe -m unittest -v test_api
cd ..\frontend
npm.cmd run build
```

Las pruebas usan SQLite temporal y cubren validacion de catalogo, cuatro ojos, estados/roles, registro inusual, ROS, screening con supresion por version, pesos, exportacion filtrada, PDF y deduplicacion del motor.

## API

`GET /api/bootstrap`, `GET /api/entities/{id}`; `POST /api/rules`, `PUT /api/rules/{id}`, `POST /api/rules/{id}/simulate`, `POST /api/rules/{id}/action`; `POST /api/monitor/run`; `POST /api/cases/next`, `/api/cases/bulk-close`, `/api/cases/{id}/action`, `/api/cases/{id}/attachments`; `POST /api/preferences`; `POST /api/screening/run`, `/api/screening/{id}/resolve`, `/api/lists/revise`; `PUT /api/config`, `POST /api/segments/recalculate`, `/api/team/delegate`; `GET /api/export/{table}`, `/api/cases/{id}/pdf`.

## Siguiente fase

Integrar datos Payway, versionar esquema relacional, migrar modelo vigente de segmentacion y validar paridad; incorporar listas oficiales y scheduler, granularidad horaria real, SSO/MFA, autorizacion de parametros confidenciales, almacenamiento de adjuntos con escaneo, retencion legal y auditoria inmutable, colas distribuidas, aprobaciones y calendario normativo validados, API UIF si corresponde, observabilidad, backups/DR y entornos cloud. El documento comercial original no forma parte de este repositorio.
