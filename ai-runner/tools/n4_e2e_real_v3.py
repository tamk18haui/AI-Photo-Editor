#!/usr/bin/env python3
"""Real Spring / MySQL / Cloudinary / N4 AI smoke. Requires user-owned JWT and project.
Never mocks remote services, never applies edits and never deletes user assets.
Secrets, URLs and entire image bytes are not written to the JSON report.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4

MAX_DOWNLOAD = 90 * 1024 * 1024

class E2EError(Exception):
    def __init__(self, text, status=None, code=None):
        self.status=status
        self.code=code
        super().__init__(text)

class Api:
    def __init__(self, base_url, jwt, timeout):
        parsed=urlsplit(base_url)
        if parsed.scheme not in ('http','https') or not parsed.netloc:
            raise E2EError('Invalid Backend URL')
        if parsed.scheme=='http' and parsed.hostname not in ('localhost','127.0.0.1'):
            raise E2EError('HTTP API URL is only allowed for localhost; use HTTPS remotely')
        self.base=base_url.rstrip('/')
        self.jwt=jwt
        self.timeout=timeout

    def call(self, method, path, payload=None, mime='application/json'):
        if not path.startswith('/') or path.startswith('//'):
            raise E2EError('Invalid relative API path')
        headers={'Authorization':'Bearer '+self.jwt,'Accept':'application/json'}
        if isinstance(payload,(dict,list)):
            body=json.dumps(payload).encode('utf-8')
            headers['Content-Type']='application/json'
        else:
            body=payload
            if payload is not None:headers['Content-Type']=mime
        req=Request(self.base+path,data=body,headers=headers,method=method)
        try:
            with urlopen(req,timeout=self.timeout) as response:
                raw=response.read(MAX_DOWNLOAD+1)
                if len(raw)>MAX_DOWNLOAD:raise E2EError('Oversized API response')
                data=json.loads(raw.decode('utf-8')) if raw else None
                return response.status,data
        except HTTPError as e:
            raw=e.read(4096)
            try:info=json.loads(raw)
            except (ValueError,UnicodeError):info={}
            raise E2EError(f'HTTP {e.code} on {method} {path}',e.code,info.get('code')) from e
        except URLError as e:raise E2EError(f'API network failure on {method} {path}: {e.reason}') from e


def image_hash(url):
    part=urlsplit(url)
    if part.scheme!='https' or not (part.hostname and
           (part.hostname=='res.cloudinary.com' or part.hostname.endswith('.cloudinary.com'))):
        raise E2EError('Refusing image download from unexpected/non-HTTPS Cloudinary host')
    req=Request(url,headers={'User-Agent':'N4-Real-E2E/1'})
    digest=hashlib.sha256();size=0
    try:
        with urlopen(req,timeout=90) as response:
            while True:
                block=response.read(1024*1024)
                if not block:break
                digest.update(block);size+=len(block)
                if size>MAX_DOWNLOAD:raise E2EError('Cloudinary resource over 90MB')
    except (HTTPError,URLError,TimeoutError) as ex:
        raise E2EError('Unable to download Cloudinary resource: '+str(ex)) from ex
    if size==0:raise E2EError('Empty Cloudinary resource')
    return {'sha256':digest.hexdigest(),'bytes':size}


def image_multipart(path):
    file=Path(path)
    if not file.is_file():raise E2EError('Image file not found: '+str(file))
    body=file.read_bytes()
    if not 12<=len(body)<=20*1024*1024:
        raise E2EError('Original upload must be an image of 12 bytes..20 MiB')
    mime=mimetypes.guess_type(file.name)[0] or ''
    if mime not in ('image/png','image/jpeg','image/webp'):
        raise E2EError('Image must be .jpg/.jpeg/.png/.webp')
    boundary='----N4E2E'+uuid4().hex
    safe_name='test_image'+file.suffix.lower()
    pre=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{safe_name}"\r\n'
         f'Content-Type: {mime}\r\n\r\n').encode('ascii')
    suffix=f'\r\n--{boundary}--\r\n'.encode('ascii')
    return pre+body+suffix,'multipart/form-data; boundary='+boundary


def run(opts, report):
    def safe(detail):
        # Never echo editor state, asset URLs, Cloudinary identifiers, or JWT.
        if isinstance(detail, dict):
            return {"objectKeys": sorted(detail.keys())[:30]}
        if isinstance(detail, list):
            return {"itemCount": len(detail)}
        if isinstance(detail, str):
            return "SHA256_COMPUTED" if len(detail)==64 else "STRING_VERIFIED"
        return detail if isinstance(detail,(bool,int,float)) else "VERIFIED"
    def check(name,fn):
        try:
            detail=fn()
            report['checks'].append({'name':name,'status':'PASS','detail':safe(detail)})
            print('[PASS]',name,':',safe(detail),flush=True)
            return detail
        except Exception as ex:
            report['checks'].append({'name':name,'status':'FAIL','reason':str(ex)[:500],
                                     'errorCode':getattr(ex,'code',None)})
            print('[FAIL]',name,str(ex),flush=True)
            raise
    token=os.environ.get(opts.token_env,'').strip()
    if not token:raise E2EError('Missing JWT in environment variable '+opts.token_env)
    client=Api(opts.base_url,token,opts.timeout)
    project_id=opts.project_id;asset_id=opts.asset_id
    check('BACKEND_AUTH_AND_PROJECT_LIST',lambda:client.call('GET','/projects')[0])
    if opts.create_test_project:
        if not opts.image:raise E2EError('--create-test-project requires --image')
        project=check('CREATE_TEST_PROJECT',lambda:client.call('POST','/projects',{
            'name':'N4 E2E '+datetime.now().strftime('%Y-%m-%d %H:%M'),
            'canvasWidth':1920,'canvasHeight':1080,'background':'#FFFFFF'
        })[1])
        project_id=project['id']
        report['projectId']=project_id
        body,ctype=image_multipart(opts.image)
        asset=check('UPLOAD_ORIGINAL_TO_CLOUDINARY',lambda:client.call(
            'POST',f'/projects/{project_id}/assets',body,ctype)[1])
        asset_id=asset['assetId']
        report['assetId']=asset_id
    elif not project_id or not asset_id:
        raise E2EError('Supply both --project-id + --asset-id, or --create-test-project --image')

    report['projectId']=project_id
    report['assetId']=asset_id
    origin=check('FETCH_OWNED_ASSET',lambda:client.call('GET',f'/projects/{project_id}/assets/{asset_id}')[1])
    if origin.get('projectId')!=project_id or origin.get('assetId')!=asset_id:
        raise E2EError('Input Project/Asset IDs mismatch')
    origin_sha=check('CLOUDINARY_DOWNLOAD_ORIGINAL',lambda:image_hash(origin['url']))['sha256']
    state_before=check('EDITOR_STATE_BEFORE',lambda:client.call('GET',f'/projects/{project_id}/state')[1])

    faces=check('HTTP_FACE_DETECT',lambda:client.call('POST','/ai/local/face-detect',{
        'projectId':project_id,'assetId':asset_id
    })[1])
    found=faces.get('faces') or []
    if len(found)<=opts.face_index:raise E2EError('Selected faceIndex not present in real test photo')
    print('Detected faces:',len(found),'Selected:',opts.face_index)

    region_result=check('HTTP_FACE_REGIONS_CLOUDINARY',lambda:client.call('POST','/ai/local/face-regions',{
        'projectId':project_id,'assetId':asset_id,'faceIndex':opts.face_index,
        'regions':['SKIN','CHEEKS','IRIS'],'outputMode':'REGION_MASK'
    })[1])
    expected_dims=(origin['width'],origin['height'])
    masks=region_result.get('masks') or []
    if len(masks)!=3 or set(a['region'] for a in masks)!={'SKIN','CHEEKS','IRIS'}:
        raise E2EError('Missing requested Face Region mask assets')
    for m in masks:
        if (m['width'],m['height'])!=expected_dims:raise E2EError('Mask/source geometry mismatch')
        if not m.get('maskAssetId'):raise E2EError('Mask assetId missing')
        meta=client.call('GET',f'/projects/{project_id}/assets/{m["maskAssetId"]}')[1]
        if meta['assetType']!='MASK':raise E2EError('Mask asset metadata incorrect')
    check('CLOUDINARY_DOWNLOAD_MASK',lambda:image_hash(masks[0]['url'])['bytes'])

    def start_makeup():
        status, data=client.call('POST','/ai/local/makeup',{
        'projectId':project_id,'assetId':asset_id,'faceIndex':opts.face_index,
        'outputMode':'FINAL',
        'effects':[{'effect':'LIPSTICK','intensity':0.4,'color':'#A94A67','feather':0.1}]
        })
        if status!=202:raise E2EError('Expected HTTP 202 for async Makeup Job')
        return data
    receipt=check('HTTP_MAKEUP_JOB_CREATE',start_makeup)
    job_id=receipt['jobId']
    report['jobId']=job_id
    start=time.monotonic()
    def await_job():
        while time.monotonic()-start < opts.job_timeout:
            _,job=client.call('GET',f'/ai/local/jobs/{job_id}')
            if job.get('provider')!='LOCAL':raise E2EError('Job provider not LOCAL')
            status=job['status']
            if status=='COMPLETED':return job
            if status in ('FAILED','CANCELLED'):
                raise E2EError('Local AI job '+status+' '+str(job.get('errorCode')))
            if status not in ('QUEUED','RUNNING'):raise E2EError('Unknown job state '+str(status))
            time.sleep(opts.poll_seconds)
        raise E2EError('Job polling timeout')
    result=check('JOB_COMPLETED',await_job)
    output_id=result.get('resultAssetId')
    if output_id:report['resultAssetId']=output_id
    if not isinstance(output_id,int) or output_id<=0:raise E2EError('Missing resultAssetId')
    result_meta=check('RESULT_ASSET_IN_PROJECT',lambda:client.call('GET',
        f'/projects/{project_id}/assets/{output_id}')[1])
    if result_meta.get('projectId')!=project_id or result_meta.get('assetType')!='AI_OUTPUT':
        raise E2EError('Job result has incorrect project or asset type')
    if (result_meta.get('width'),result_meta.get('height'))!=expected_dims:
        raise E2EError('Makeup output dimensions changed unexpectedly')
    if result_meta.get('url')!=result.get('resultUrl'):
        raise E2EError('Job result URL and asset URL mismatch')
    check('CLOUDINARY_DOWNLOAD_RESULT',lambda:image_hash(result_meta['url'])['bytes'])
    origin_after=check('ORIGINAL_ASSET_STILL_PRESENT',lambda:client.call('GET',
        f'/projects/{project_id}/assets/{asset_id}')[1])
    if origin_after['url']!=origin['url'] or origin_after['assetId']!=origin['assetId']:
        raise E2EError('Original asset unexpectedly changed')
    sha_after=check('CLOUDINARY_ORIGINAL_BYTES_UNCHANGED',lambda:image_hash(origin_after['url'])['sha256'])
    if sha_after!=origin_sha:raise E2EError('Original Cloudinary image bytes changed')
    state_after=check('EDITOR_STATE_AFTER_NO_APPLY',lambda:client.call('GET',
        f'/projects/{project_id}/state')[1])
    if state_after!=state_before:
        raise E2EError('Editor state changed without user clicking Apply')
    report.update({'complete':True,'projectId':project_id,'assetId':asset_id,
                   'resultAssetId':output_id,'jobId':job_id})
    return report


def main():
    p=argparse.ArgumentParser(description='Real N4 API/Job/Cloudinary E2E, no fake inference')
    p.add_argument('--base-url',default='http://127.0.0.1:8081/api')
    p.add_argument('--token-env',default='N4_TEST_ACCESS_TOKEN')
    p.add_argument('--create-test-project',action='store_true')
    p.add_argument('--image')
    p.add_argument('--project-id',type=int)
    p.add_argument('--asset-id',type=int)
    p.add_argument('--face-index',type=int,default=0)
    p.add_argument('--timeout',type=int,default=180)
    p.add_argument('--job-timeout',type=int,default=900)
    p.add_argument('--poll-seconds',type=float,default=1.5)
    p.add_argument('--report',default='N4_E2E_REAL_REPORT.json')
    a=p.parse_args()
    result={'format':'N4_REAL_HTTP_E2E_V1','timestampUtc':datetime.now(timezone.utc).isoformat(),
            'complete':False,'checks':[]}
    try:
        result=run(a,result)
        print('[SUMMARY] REAL_E2E_PASS',flush=True)
        return_code=0
    except (E2EError, ValueError, KeyError, TypeError, OSError) as ex:
        print('[SUMMARY] REAL_E2E_FAIL',str(ex),flush=True)
        # Do not include user token, URL, image contents or traceback.
        result['complete']=False
        result['failure']=str(ex)[:500]
        return_code=1
    out=Path(a.report)
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n',encoding='utf8')
    print('[REPORT]',out.resolve())
    return return_code

if __name__=='__main__':raise SystemExit(main())
