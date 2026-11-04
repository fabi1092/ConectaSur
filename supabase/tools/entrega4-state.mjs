// Evidencia de consola para B08-B12. Solo lectura; no crea ni modifica datos.
import {mkdirSync,writeFileSync} from 'node:fs';
import {query,settings,api} from './admin.mjs';
const config=settings();
if(new URL(config.url).hostname!=='supabase-surcode.codepulse.cl')throw new Error('Revisar la instancia exclusiva de SurCode');
const counts=await query("select 'shops' as tabla,count(*)::int as filas from public.shops union all select 'profiles',count(*)::int from public.profiles union all select 'associations',count(*)::int from public.associations union all select 'entrepreneur_types',count(*)::int from public.entrepreneur_types union all select 'categories',count(*)::int from public.categories union all select 'product_types',count(*)::int from public.product_types");
const indexes=await query("select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname");
const tables=await query("select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename");
const policies=await query("select schemaname,tablename,policyname,cmd from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname");
const buckets=await query("select id,public,file_size_limit,allowed_mime_types from storage.buckets where id in ('shop-images','association-images') order by id");
const migrations=await query('select id from app_private.schema_migrations order by id');
const functionReady=await query("select to_regprocedure('public.update_entrepreneur_account(uuid,text,text,text)') is not null as ready");
const auth=await api('/auth/v1/settings');if(!auth.ok)throw new Error('No se pudo consultar la configuración pública de Auth');
const report={checkedAt:new Date().toISOString(),instance:config.url,environment:'desarrollo de clase',productionSeparationVerified:false,accountRenameReady:functionReady[0].ready,googleEnabled:auth.data?.external?.google===true,counts,indexes,tables,policies,buckets,migrations,limits:['Lectura de metadatos desde Studio, no demuestra operaciones con permisos de cliente','La demostración de permisos se ejecuta separadamente con usuarios de aplicación','No hay una configuración de producción separada documentada/verificada','Supabase sustituye el diseño histórico Firestore; no se afirma publicación de reglas Firebase']};
const output=new URL('../../security/reports/entrega4-backend/',import.meta.url);mkdirSync(output,{recursive:true});writeFileSync(new URL('estado-servidor.json',output),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({accountRenameReady:report.accountRenameReady,googleEnabled:report.googleEnabled,indexes:indexes.length,tables:tables.length,buckets:buckets.length,migrations:migrations.map(m=>m.id)}));
