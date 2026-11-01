# Avances de Benjamín Tampier

## Hito 1: base Android

Base compilable con logo y prueba de lanzamiento. Migración a Views/XML editables en Design/Palette y corrección de fuente de vista previa. Commits a1694f7, 4a82550 y 1d59a24.

## Hito 2: pantallas y accesibilidad

Commit fd5f73f: navegación XML, catálogo/detalle, tienda, ayuda, ajustes de letras/botones, contraste, lectura opcional y logo local. Ver hito-2-pantallas.md. No declara implementadas las pantallas pendientes del resto del equipo.

## Hito 3: seguridad

Commits 829ba1c y 68a2024: pruebas e informe sobre Firebase, validaciones y mejoras de dependencias. Ese backend fue sustituido por Supabase tras recibir la instancia del profesor. Los informes y resultados anteriores quedan en docs/historico y en el historial de Git.

## Migración Supabase: dos hitos nuevos

1. Base de datos Supabase (3b0702a): SQL, RLS, RPC de venta, Storage, datos ficticios y 40 pruebas de API real.
2. Conexiones Android/web: retiro de SDK Firebase, repositorios Supabase, sesión/caché/borradores cifrados, fotos online, pruebas nativas y web, workflows y documentación actualizada.

El informe vigente es hito-3-seguridad.md. La integración de las pantallas finales corresponde a sus integrantes; los contratos y métodos nuevos están explicados en docs/integracion-supabase.md.

## Forma de entrega

Commits con mensajes simples y avances por hitos. Benjamín solicitó publicarlos en main. La protección de main y los PR revisados que exige la pauta son un criterio de colaboración que el equipo todavía debe comprobar.
