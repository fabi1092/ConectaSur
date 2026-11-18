// ============================================================================
// ConectaSur · Entrega 6 · Seed de Datos de Alonso Núñez (solo Web)
// ============================================================================
// Aplica los datos reales de prueba en la instancia de Supabase del grupo:
// - 2+ tiendas en Puerto Montt y Alerce con punto de retiro en mapa
// - Productos con stock > 1 y variantes de distinta foto y precio
// - Productos en modalidad pieza única (stock = 1)
// - 1+ asociación con tiendas integrantes
// - 2+ ferias futuras en Puerto Montt y Alerce con coordenadas reales
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { query } from './admin.mjs';

export async function seedAlonso() {
  console.log('Cargando datos reales de prueba de Alonso Núñez...');
  const sqlPath = new URL('../demo/datos-prueba-alonso.sql', import.meta.url);
  const sql = readFileSync(sqlPath, 'utf8');
  const result = await query(sql);
  console.log('✓ Datos reales de prueba cargados exitosamente.');
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await seedAlonso();
  } catch (error) {
    console.error('Error al cargar datos:', error.message);
    process.exitCode = 1;
  }
}
