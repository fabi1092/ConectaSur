"""MobSF en contenedor local del runner; no usa servicios públicos ni credenciales del equipo."""
import json,os,secrets,subprocess,time,urllib.request,urllib.parse,sys,hashlib
from pathlib import Path
apk=Path(sys.argv[1]);out=Path('security/reports/mobsf');out.mkdir(parents=True,exist_ok=True)
key=secrets.token_hex(32);image='opensecurity/mobile-security-framework-mobsf@sha256:e5d65aec0385810d31ce95d06396b06ed74712d01bb2f0d12bc3deabaf28ccb9';container=None

def request(path,data=None,content_type='application/x-www-form-urlencoded',timeout=600):
    req=urllib.request.Request('http://127.0.0.1:8000'+path,data=data,headers={'X-Mobsf-Api-Key':key,'Content-Type':content_type})
    with urllib.request.urlopen(req,timeout=timeout) as r:return json.load(r)
try:
    subprocess.run(['docker','pull',image],check=True)
    digest=json.loads(subprocess.check_output(['docker','image','inspect',image]))[0]['RepoDigests']
    container=subprocess.check_output(['docker','run','--rm','-d','-p','127.0.0.1:8000:8000','-e','MOBSF_API_ONLY=1','-e','MOBSF_API_KEY='+key,'-e','MOBSF_VT_ENABLED=0','-e','MOBSF_VT_UPLOAD=0',image],text=True).strip()
    for attempt in range(100):
        try:
            request('/api/v1/scans');break
        except Exception:
            if attempt==99:raise RuntimeError('MobSF no inició dentro del plazo')
            time.sleep(3)
    boundary='ConectaSur'+secrets.token_hex(12)
    data=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="conectasur.apk"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()+apk.read_bytes()+f'\r\n--{boundary}--\r\n'.encode())
    upload=request('/api/v1/upload',data,'multipart/form-data; boundary='+boundary)
    if 'hash' not in upload:raise RuntimeError('MobSF no aceptó el APK: '+str(upload))
    params=urllib.parse.urlencode({'hash':upload['hash'],'scan_type':'apk','file_name':'conectasur.apk','re_scan':0}).encode()
    scan=request('/api/v1/scan',params,timeout=900)
    if scan.get('error'):raise RuntimeError('MobSF no completó el análisis: '+str(scan['error']))
    report=request('/api/v1/report_json',params)
    if report.get('error') or not report.get('package_name'):raise RuntimeError('Informe MobSF incompleto')
    (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'evidence.json').write_text(json.dumps({'commit':os.getenv('GITHUB_SHA'),'image':digest,'apk_sha256':hashlib.sha256(apk.read_bytes()).hexdigest(),'package':report['package_name'],'version':report.get('version_name'),'scope':'Analisis estatico del APK debug sin credenciales locales; no se ejecuto analisis dinamico.'},indent=2),encoding='utf-8')
    print('MobSF terminó. Informe y hash del APK guardados como artefacto.')
finally:
    if container:subprocess.run(['docker','stop',container],stdout=subprocess.DEVNULL,check=False)