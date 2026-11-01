// Resume salidas reales y fija los hashes de las fuentes probadas.
// Ejecutar desde la raiz: node security/collect-evidence.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const git = process.env.GIT_EXE ?? 'git';
const tracked = execFileSync(git, ['ls-files', '-z'], { cwd: fileURLToPath(root), encoding: 'utf8' })
  .split('\0').filter(Boolean);
const findings = [];
for (const path of tracked) {
  if (/(^|\/)(google-services\.json|firebase-config\.json|local\.properties|service[-_]?account.*\.json)$|\.(jks|keystore)$/i.test(path)) {
    findings.push({ path, finding: 'Archivo de configuracion o firma que requiere revision' });
  }
  if (/\.(kt|kts|js|mjs|json|md|yml|yaml|xml|rules)$/.test(path)) {
    const content = read(path);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)
      || /"type"\s*:\s*"service_account"/.test(content)) {
      findings.push({ path, finding: 'Posible clave privada o cuenta de servicio' });
    }
  }
}
const rulesLog = read('security/reports/reglas.log');
const count = (name) => {
  const match = rulesLog.match(new RegExp('ℹ ' + name + ' (\\d+)'));
  if (!match) throw new Error('Falta resultado de pruebas: ' + name);
  return Number(match[1]);
};
const tests = { tests: count('tests'), suites: count('suites'), passed: count('pass'), failed: count('fail') };
if (tests.failed || tests.tests !== tests.passed || !rulesLog.includes('Script exited successfully')) {
  throw new Error('La suite de reglas/web no termino correctamente');
}
const unitFiles = ['CatalogTest', 'SalesTest'].map((name) =>
  read('android/app/build/test-results/testDebugUnitTest/TEST-cl.surcode.conectasur.domain.' + name + '.xml'));
const attribute = (xml, name) => Number(xml.match(new RegExp(name + '="(\\d+)"'))[1]);
const unit = unitFiles.reduce((acc, xml) => ({
  tests: acc.tests + attribute(xml, 'tests'),
  failures: acc.failures + attribute(xml, 'failures'), errors: acc.errors + attribute(xml, 'errors'),
}), { tests: 0, failures: 0, errors: 0 });
const lint = read('android/app/build/reports/lint-results-debug.xml');
const manifest = read('android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml');
const sources = [
  'firebase/firestore.rules', 'firebase/storage.rules', 'firebase/test/rules.test.js',
  'firebase/test/web.test.js', 'firebase/package-lock.json', 'web/firebase-data.js', 'web/package-lock.json',
];
const evidence = {
  checkedAt: new Date().toISOString(),
  environment: { node: process.version, project: 'demo-conectasur', backend: 'Emulator Suite local' },
  rulesAndWeb: tests, androidUnit: unit,
  androidBuild: read('security/reports/android.log').includes('BUILD SUCCESSFUL'),
  lint: {
    errors: [...lint.matchAll(/severity="(?:Error|Fatal)"/g)].length,
    warnings: [...lint.matchAll(/severity="Warning"/g)].length,
  },
  mergedManifestPermissions: [...manifest.matchAll(/<uses-permission\s+android:name="([^"]+)"/g)].map((m) => m[1]),
  npm: {
    firebase: JSON.parse(read('security/reports/audit-firebase.json')).metadata.vulnerabilities,
    web: JSON.parse(read('security/reports/audit-web.json')).metadata.vulnerabilities,
  },
  trackedFileScan: { checkedFiles: tracked.length, findings, scope: 'Patrones acotados; no certifica ausencia de secretos ni revisa todo el historial' },
  sourceHashNormalization: 'UTF-8, CRLF normalizado a LF para comparar checkouts Windows/Linux',
  sourceSha256: Object.fromEntries(sources.map((path) => [path, createHash('sha256').update(read(path).replace(/\r\n/g, '\n')).digest('hex')])),
  pending: ['Biometria real', 'App Check', 'Auditoria del administrador', 'Panel web visual', 'Pantallas finales integradas', 'MobSF', 'Validacion normativa de privacidad'],
};
writeFileSync(new URL('security/reports/verification.json', root), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ rulesAndWeb: tests, androidUnit: unit, lint: evidence.lint, secretPatternFindings: findings.length }, null, 2));
if (!evidence.androidBuild || unit.errors || unit.failures || evidence.lint.errors || findings.length) process.exitCode = 1;
