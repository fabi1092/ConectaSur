// Consulta OSV con el inventario de Gradle. Requiere Node >=24.12 y acceso a internet.
// No sube codigo, credenciales ni configuracion: solo coordenadas Maven y versiones.
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('./reports/dependencies.log', import.meta.url);
const line = readFileSync(file, 'utf8').split(/\r?\n/)
  .find((value) => value.startsWith('SECURITY_DEPENDENCIES='));
if (!line) throw new Error('Primero ejecutar la tarea securityDependencies de Gradle');
const dependencies = JSON.parse(line.slice('SECURITY_DEPENDENCIES='.length));
const response = await fetch('https://api.osv.dev/v1/querybatch', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ queries: dependencies.map((d) => ({
    package: { ecosystem: 'Maven', name: d.name }, version: d.version,
  })) }),
  signal: AbortSignal.timeout(60000),
});
if (!response.ok) throw new Error('OSV respondio HTTP ' + response.status);
const data = await response.json();
if (data.results?.length !== dependencies.length || data.results.some((r) => r.error)) {
  throw new Error('OSV no completo todas las consultas');
}
const results = dependencies.map((dependency, i) => ({
  ...dependency, advisories: (data.results[i].vulns ?? []).map((v) => v.id),
}));
const report = {
  checkedAt: new Date().toISOString(), source: 'https://api.osv.dev/v1/querybatch',
  scope: 'Maven: debugRuntimeClasspath; no analiza codigo ni el comportamiento de la app',
  dependencies: results, affectedDependencies: results.filter((d) => d.advisories.length).length,
};
writeFileSync(new URL('./reports/android-dependencies.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log('Dependencias consultadas: ' + results.length + '; con avisos: ' + report.affectedDependencies);
if (report.affectedDependencies) process.exitCode = 1;
