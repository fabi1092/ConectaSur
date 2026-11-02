# Seguridad — cierre de Entrega 5

**Fecha:** 2 de noviembre de 2026. **Responsable:** Benjamín Tampier.

## Alcance y resultados

Se comprobaron Auth, API, PostgreSQL/RLS, RPC, Storage y la capa web de la instancia exclusiva del grupo. Las pruebas usan clientes anon/JWT por perfil; Studio solo prepara o elimina datos ficticios. El cliente no usa service_role ni credenciales administrativas del profesor.

- **59 pruebas reales aprobadas:** 12 de disponibilidad/stock/configuración de esta entrega, 40 de permisos/productos/ventas/Storage y 7 de la capa web.
- **30 pruebas unitarias aprobadas:** catálogo, ventas, estado de tienda y reglas de agotamiento/lectura CLP.
- **8 pruebas instrumentadas aprobadas en API 36:** flujo de producto, borrador cifrado, sincronización, venta/historial, acceso/tienda, conversión de imágenes e inicio.
- **6 pruebas de navegación aprobadas** en el build local de demostración.
- Compilación y Lint correctos. Las advertencias restantes están registradas en la evidencia; no se ocultan como si fueran cero.
- **50 dependencias Maven consultadas en OSV, ninguna con avisos conocidos.** La web publicó con npm ci sin vulnerabilidades notificadas. Los resultados corresponden a la fecha consultada, no certifican ausencia de cualquier vulnerabilidad.
- **MobSF v4.6.5 ejecutado** en GitHub Actions; imagen Docker fijada por digest. [Ejecución](https://github.com/fabi1092/ConectaSur/actions/runs/41482716645). El APK analizado corresponde al commit 6c3a3bb, versión 0.5.0-entrega5, compilado sin credenciales locales. Los cambios posteriores de interfaz son etiquetas, desplazamiento y estilo de casillas; no cambian el modelo de permisos. [Informe JSON completo](../../security/reports/mobsf/report.json) y [procedencia/hash](../../security/reports/mobsf/evidence.json).
- Navegador Chromium: login real desde la URL publicada, cuatro secciones administrativas, logout y login sin desbordamiento horizontal en viewport móvil 390×844.

## Hallazgos, gravedad y tratamiento

| ID | Hallazgo / gravedad | Corrección o justificación |
|---|---|---|
| S01 | APK debug y certificado de depuración: **Alta** en tres avisos de MobSF (manifest, BuildConfig y certificado). | Es el APK de desarrollo para la entrega, no una distribución de producción. No se presenta como riesgo corregido. Para la publicación final se debe firmar release con clave privada protegida y comprobar que debuggable=false. Las contraseñas de cuenta y Studio no están incluidas. |
| S02 | Compatibilidad con Android 8/API 26: **Advertencia**. | Se conserva el mínimo provisional para estudiar compatibilidad con las usuarias. La versión del sistema puede carecer de parches; se debe confirmar inventario de dispositivos y recomendar sistemas actualizados. No se eleva el mínimo sin evidencia del levantamiento. |
| S03 | ProfileInstallReceiver exportado: **Advertencia**. | Componente de AndroidX protegido por android.permission.DUMP. El permiso lo define Android y no es un permiso normal solicitado por cualquier app. Las actividades privadas y FileProvider de ConectaSur tienen exported=false; el único ingreso público es MainActivity. Se conserva la dependencia y se registra el aviso. |
| S04 | Posible secreto fijo en SupabaseSalesRepository: **Advertencia**, revisión manual. | La coincidencia corresponde a la construcción de la solicitud y su identificador de idempotencia. El ID se genera con UUID aleatorio y no es una contraseña ni una credencial administrativa. La sesión se cifra en Android Keystore. No se considera una clave privada incrustada. |
| S05 | Fotografía temporal de cámara: **Advertencia en el primer análisis**, ya no señalada en el segundo. | Se limita a la caché privada product_photos, se comparte un URI específico con permiso temporal mediante FileProvider, se reduce y se conserva la copia de trabajo cifrada. Tras preparar correctamente la foto se elimina el archivo temporal creado por el editor. No se usa almacenamiento externo público. |
| S06 | Reintento de venta puede duplicar descuento: **Alta potencial**, mitigada. | Recibo de idempotencia en servidor, bloqueo de fila y solicitud pendiente cifrada. Un reintento conserva producto/variante/cantidad/lugar y devuelve el mismo resultado. Pruebas de concurrencia e idempotencia aprobadas. |
| S07 | Stock, precios ocultos o datos ajenos expuestos: **Alta potencial**, mitigada. | RLS por dueña activa, vistas públicas con columnas explícitas y precios filtrados en servidor. El admin de aplicación no lee ventas/stock privados. Casos rechazados para visitante, comprador, emprendedora ajena y admin. |
| S08 | Borrador perdido o mezclado entre cuentas: **Media potencial**, mitigada. | AES-GCM con clave de Android Keystore, AAD por registro y prefijo UID/tienda. Las fotos aún no subidas también están en el borrador cifrado. La cola se reenvía solo con la cuenta propietaria. |

Los avisos SetTextI18n, actualizaciones de dependencias, XML y recomendaciones de widgets de Lint se registran como mejoras; no equivalen por sí solos a explotación. Las actualizaciones de biblioteca se deben probar antes de integrarlas.

## Reproducción

1. JDK 21, SDK 36 y Node 24.12 o superior; configurar solo URL/anon en los clientes locales.
2. Desde android: `./gradlew assembleDebug assembleDebugAndroidTest testDebugUnitTest lintDebug`.
3. Desde supabase: `npm test` con TEST_DATABASE_URL de PostgreSQL local vacío conectasur_test; el workflow crea ese entorno. No usar la instancia de clase para el bootstrap aislado.
4. Desde supabase: `npm run test:live` con configuración privada en memoria. En este computador, `supabase/tools/local-access.ps1 -Action test` usa DPAPI. Los fixtures de API se limpian al terminar.
5. Runner Android: clases Entrega5Test, StoreAccessTest y LaunchTest con supabaseLive=true y cuenta ficticia por argumentos. Los logs completos se conservan fuera de Git en security/reports/*.log.
6. Workflow Analisis MobSF: construye un APK de demostración, inicia MobSF en el runner, ejecuta upload/scan/report_json y adjunta el informe. VirusTotal/upload externo están deshabilitados. El script registra hash e imagen y elimina el contenedor.

## Detección y límites

RNF-SEG-07: triggers de perfiles, tiendas, asociaciones y vínculos generan admin_actions con actor/acción/destino/fecha; la app cliente no puede falsificar el registro. Se ampliará para ferias cuando exista ese módulo.

RNF-SEG-06: Auth/RLS no sustituyen Firebase App Check. La migración requiere acordar un mecanismo de integridad equivalente con el profesor; queda como Importante para la entrega final, como permite la planificación. No se declara completado.

La lectura TalkBack, huella fuerte, dictado y cámara física requieren pruebas en teléfonos reales. No se realizó análisis dinámico MobSF, pentest independiente ni certificación de producción. El informe identifica esas limitaciones y conserva los resultados verificables de esta entrega.
