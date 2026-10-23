# Alcance verificable respecto de la propuesta

Base: propuesta AML / PLAFT v2.0 aportada por el usuario. Este archivo identifica implementacion, simplificacion y trabajo pendiente. No es una declaracion de cumplimiento legal.

| Funcion propuesta | MVP entregado | Pendiente productivo |
| --- | --- | --- |
| Tres modulos / cuatro negocios | Casos, motor, segmentacion; adquirencia ARS/USD, devoluciones, cuenta | Integraciones Payway |
| Jerarquia CUIT / establecimiento / subcliente | IDs vinculados, ficha 360 y riesgo por establecimiento / CUIT | Multiples subclientes reales por establecimiento |
| Reglas sin codigo | Catalogo numerico, condiciones AND, ventana, negocio, umbral, severidad | Catalogo completo acordado con Cumplimiento; OR y ventanas moviles |
| Simular seis meses | 180 dias sinteticos, ventanas contiguas, resultados por entidad | Warehouse real y comparacion de volumen operativo |
| Ajuste instantaneo en 90 dias | Edicion, guardado y simulacion con periodo elegido | Comparacion automatica antes/despues sin guardar |
| Sombra / cuatro ojos / versionado / rollback | API y UI operativas, restauracion a borrador | Scheduler, aprobaciones SSO y retencion de cada ejecucion |
| Screening | Matching normalizado/fuzzy de razon social y beneficiario, decisiones, supresion por version | Fuentes RePET/ONU/OFAC/UE/UK/PEP/GAFI reales, alta/diario/incremental |
| Relaciones | Navegacion expandible entre entidades por CUIT, CBU, beneficiario, dispositivo y domicilio | Grafo visual con telefono, terminal, representante y fuentes verificadas |
| Vista 360 / casos similares | Perfil, operatoria, documentos sinteticos, casos, score y coincidencia de regla | Motor de similitud avanzado e integracion documental |
| Explicacion de alerta | Valor, operador, umbral, ventana; visuales agregados en tablero | Grafico historico por alerta y explicacion de todas las condiciones |
| Busqueda global | Busqueda en grillas de casos y entidades, CUIT/CBU/nombres/IDs | Buscador unificado disponible desde cada pantalla |
| Vistas / cierre lote / vinculacion | Filtros personales persistidos, cierre supervisor con motivo, vinculo bidireccional | Expediente consolidado de investigacion |
| Comentarios / menciones / watchlist | Comentarios y avisos internos por @usuario y nuevos casos en entidades seguidas | Push/email y avisos por cada nueva operacion |
| Pausas / recordatorios | Fecha de pausa persistida; reloj visible no se detiene | Scheduler de recordatorios, reasignacion por vencimiento |
| Adjuntos | Carga/arrastre, validacion de extension/tamano, descarga | Antivirus, preview, OCR, busqueda de contenido y object storage |
| Comparacion | Dos entidades lado a lado con score/riesgo/perfil | Dos periodos con operatoria agregada |
| Novedades | Historial cronologico del caso | Marcador de ultima lectura por usuario y diferencias |
| Plantillas / ROS | Plantilla de cierre, borrador desde datos, edicion, aprobacion por oficial diferente del autor | Plantillas por tipologia y formato legal validado; envio UIF |
| Asignacion / capacidad / ausencia | Tomar siguiente por riesgo/FIFO/aleatorio, cupo, reasignacion supervisor, delegacion inmediata | Afinidad historica, asignacion automatica critica, calendario de ausencias |
| Workflow configurable | Estados de propuesta y permisos definidos en backend, campos requeridos | Editor administrativo de estados/transiciones y notificaciones |
| Tableros / calidad / auditoria | Carga por usuario, embudo, riesgo, plazos, muestra deterministica de cierres, trazas y exportaciones | Tiempos dedicados y comparacion de productividad, tipologias no cubiertas |
| Exportar todo | Excel casos/entidades/reglas/auditoria; PDF expediente | Todas las vistas restantes, anexos binarios y formato de presentacion oficial |
| Movil | Layout responsive y acciones de aprobacion | SSO/MFA y pruebas de dispositivos reales |
| Atajos | Navegacion y formularios por teclado nativos del navegador | Atajos personalizados de cola |
| Segmentacion | Matriz ponderada, umbrales, recalculo, historial y agregacion | Modelo real, validacion de paridad, diligencia automatica y versionado aprobado |
| Infra / seguridad / soporte | Ejecucion local, README, pruebas, datos sinteticos | Cloud Payway, DR, SSO/MFA, cifrado, retencion, revisor anonimizado, SLA y soporte |

El alcance comercial completo excede este MVP. Los puntos pendientes estan explicitados para que el equipo pueda planificar la siguiente iteracion sin confundir demostracion con integracion productiva.
