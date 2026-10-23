import base64
import hashlib
import io
import json
import random
import unicodedata
from datetime import date, datetime, timedelta, timezone
from difflib import SequenceMatcher
from typing import Literal
from uuid import uuid4
from xml.sax.saxutils import escape

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field
from domain import BUSINESSES, CATALOG, STATES, TRANSITIONS, evaluate, metrics, now
from storage import state

app=FastAPI(title='Neural Co AML MVP',version='0.1.0')

class Strict(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)

class Condition(Strict):
    field: str
    operator: Literal['==','!=','>','>=','<','<=']
    value: float

class RuleInput(Strict):
    name: str=Field(min_length=3,max_length=120)
    business: str
    window_days: int=Field(ge=1,le=180)
    severity: Literal['Bajo','Medio','Alto']='Medio'
    conditions: list[Condition]=Field(min_length=1,max_length=12)

class Dates(Strict):
    start_date: date
    end_date: date

class Operation(Strict):
    action: str
    reason: str=''
    target: str=''
    text: str=''
    ids: list[str]=[]
    fields: dict[str,str]={}

def actor(data, uid):
    result=next((u for u in data['users'] if u['id']==uid),None)
    if not result: raise HTTPException(401,'Selecciona un usuario demo valido')
    return result

def privileged(user):
    if user['role'] not in ['supervisor','officer']: raise HTTPException(403,'Requiere supervisor o Cumplimiento')

def item(data, table, id):
    result=next((x for x in data[table] if x['id']==id),None)
    if result is None: raise HTTPException(404,'Registro inexistente')
    return result

def audit(data,user,action,target,detail=''):
    previous=data['audit'][-1]['hash'] if data['audit'] else ''
    event=dict(id=str(uuid4()),at=now(),user=user['id'],action=action,target=target,detail=detail,previous=previous)
    event['hash']=hashlib.sha256(json.dumps(event,sort_keys=True).encode()).hexdigest()
    data['audit'].append(event)

def require_reason(value):
    if len(value.strip())<8: raise HTTPException(422,'Escribi un motivo de al menos 8 caracteres')

def dates(payload):
    if payload.end_date<payload.start_date or (payload.end_date-payload.start_date).days>180: raise HTTPException(422,'Selecciona un periodo de hasta 181 dias, en orden cronologico')
    return payload.start_date.isoformat(),payload.end_date.isoformat()

def rule_payload(payload):
    if payload.business not in BUSINESSES: raise HTTPException(422,'Negocio fuera del catalogo')
    if any(c.field not in [v['field'] for v in CATALOG] for c in payload.conditions): raise HTTPException(422,'Variable fuera del catalogo')
    return payload.model_dump()

def enrich_case(data,c):
    e=item(data,'entities',c['entity_id'])
    cap=datetime.fromisoformat(c['oldest_operation']).replace(tzinfo=timezone.utc)+timedelta(days=data['config']['operation_limit_days'])
    deadline=min(cap,datetime.fromisoformat(c['suspicious_at'])+timedelta(hours=data['config']['regulatory_hours'])) if c['suspicious_at'] else cap
    return dict(c,entity_name=e['name'],cuit=e['cuit'],deadline=deadline.isoformat(),hours_remaining=round((deadline-datetime.now(timezone.utc)).total_seconds()/3600,1))

@app.get('/api/health')
def health(): return {'status':'ok','demo':True}

@app.get('/api/bootstrap')
def bootstrap(x_user: str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user)
        audit(data,user,'consulta','dashboard')
        result={k:data[k] for k in ['entities','rules','users','config','saved_views','watchlist','screening','lists','runs']}
        result.update(cases=[dict(enrich_case(data,c),attachments=[{k:v for k,v in a.items() if k!='content'} for a in c['attachments']]) for c in data['cases']],audit=data['audit'][-300:][::-1],notifications=[n for n in data['notifications'] if n['user']==x_user],catalog=CATALOG,businesses=BUSINESSES,states=STATES,transitions=TRANSITIONS,transaction_count=len(data['transactions']),data_start=min(t['date'] for t in data['transactions']),data_end=max(t['date'] for t in data['transactions']),current_user=user)
        return result

@app.get('/api/entities/{id}')
def entity_detail(id: str,x_user: str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); e=item(data,'entities',id)
        related=[]
        for other in data['entities']:
            shared=[k for k in ['cuit','cbu','beneficiary','device','address'] if other[k]==e[k]]
            if other['id']!=id and shared: related.append(dict(other,shared=shared))
        audit(data,user,'consulta entidad',id)
        return dict(e,transactions=[t for t in data['transactions'] if t['entity_id']==id],related=related,cases=[enrich_case(data,c) for c in data['cases'] if c['entity_id']==id])

@app.post('/api/rules')
def create_rule(payload: RuleInput,x_user: str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); r=dict(rule_payload(payload),id='R'+uuid4().hex[:7],status='draft',version=1,author=user['id'],approver=None,updated_at=now(),history=[],last_simulation=None)
        data['rules'].append(r); audit(data,user,'crear regla',r['id']); return r

@app.put('/api/rules/{id}')
def edit_rule(id:str,payload:RuleInput,x_user:str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); r=item(data,'rules',id)
        if r['status']=='active': raise HTTPException(409,'Pasar a borrador antes de editar')
        r['history'].append({k:v for k,v in r.items() if k!='history'})
        r.update(rule_payload(payload),version=r['version']+1,author=user['id'],status='draft',last_simulation=None,approver=None,updated_at=now())
        audit(data,user,'editar regla',id); return r

@app.post('/api/rules/{id}/simulate')
def simulate(id:str,payload:Dates,x_user:str=Header(default='ana')):
    start,end=dates(payload)
    with state() as data:
        user=actor(data,x_user); r=item(data,'rules',id); matched=evaluate(data,r,start,end)
        result=dict(start=start,end=end,version=r['version'],matched_entities=len(matched),matches=matched,total_entities=sum(e['business']==r['business'] for e in data['entities']),at=now())
        r['last_simulation']=result; audit(data,user,'simular regla',id,f'{start} / {end}'); return result

@app.post('/api/rules/{id}/action')
def rule_action(id:str,payload:Operation,x_user:str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); r=item(data,'rules',id); require_reason(payload.reason)
        if payload.action=='submit':
            if not r['last_simulation'] or r['last_simulation']['version']!=r['version']: raise HTTPException(409,'Simula esta version antes de solicitar aprobacion')
            if r['status'] not in ['draft','shadow']: raise HTTPException(409,'Estado incompatible')
            r['status']='pending'
        elif payload.action=='approve':
            privileged(user)
            if r['author']==user['id']: raise HTTPException(403,'Cuatro ojos: quien edita no aprueba')
            if r['status']!='pending': raise HTTPException(409,'No hay aprobacion pendiente')
            r.update(status='active',approver=user['id'])
        elif payload.action=='shadow':
            if r['status'] not in ['draft','active']: raise HTTPException(409,'Estado incompatible')
            r['status']='shadow'
        elif payload.action=='draft': r['status']='draft'
        elif payload.action=='rollback':
            privileged(user)
            if not r['history']: raise HTTPException(409,'Sin version anterior')
            previous=r['history'][-1]; version=r['version']+1
            snapshot={k:v for k,v in r.items() if k!='history'}
            r.update(previous); r.update(version=version,status='draft',author=user['id'],approver=None,last_simulation=None); r['history'].append(snapshot)
        else: raise HTTPException(422,'Accion desconocida')
        r['updated_at']=now(); audit(data,user,payload.action,id,payload.reason); return r

@app.post('/api/monitor/run')
def run_monitor(x_user:str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); privileged(user); generated=0; shadow=0
        today=date.today()
        for r in data['rules']:
            if r['status'] not in ['active','shadow']: continue
            matches=evaluate(data,r,(today-timedelta(days=r['window_days']-1)).isoformat(),today.isoformat())
            if r['status']=='shadow': shadow+=len(matches); continue
            for m in matches:
                if any(c['entity_id']==m['entity_id'] and c['rule_id']==r['id'] and c['created_at'][:10]==today.isoformat() for c in data['cases']): continue
                first=r['conditions'][0]; observed=m['values'][first['field']]
                c=dict(id='C'+uuid4().hex[:7],entity_id=m['entity_id'],rule_id=r['id'],title=r['name'],business=r['business'],risk=r['severity'],status='Nueva',assignee=None,created_at=now(),oldest_operation=m['period_start'],suspicious_at=None,explanation=f"{first['field']}: {observed} {first['operator']} {first['value']} en {r['window_days']} dias.",observed=observed,threshold=first['value'],reason='',unusual={},comments=[],attachments=[],linked_cases=[],snooze_until=None,ros='',ros_author=None,updated_at=now())
                data['cases'].append(c); generated+=1
                for w in data['watchlist']:
                    if w['entity_id']==m['entity_id']: data['notifications'].append(dict(id=uuid4().hex,user=w['user'],text=f"Nueva alerta {c['id']} para entidad en seguimiento",case_id=c['id'],at=now()))
        run=dict(at=now(),generated=generated,shadow_matches=shadow); data['runs'].append(run); audit(data,user,'ejecutar motor','monitor',json.dumps(run)); return run

def take_next(data,user):
    open_cases=[c for c in data['cases'] if c['assignee']==user['id'] and c['status'] not in ['Cerrada no inusual','ROS aprobado']]
    if len(open_cases)>=user['capacity']: raise HTTPException(409,'Capacidad maxima alcanzada')
    queue=[c for c in data['cases'] if c['status']=='Nueva' and c['assignee'] is None]
    if not queue: raise HTTPException(404,'No hay casos disponibles')
    if data['config']['assignment']=='random': random.shuffle(queue)
    else: queue.sort(key=lambda c: (0 if data['config']['assignment']=='risk' and c['risk']=='Alto' else 1,c['created_at']))
    c=queue[0]; c.update(assignee=user['id'],status='Asignada',updated_at=now()); audit(data,user,'tomar siguiente',c['id']); return c

@app.post('/api/cases/next')
def next_case(x_user:str=Header(default='ana')):
    with state() as data: return take_next(data,actor(data,x_user))

@app.post('/api/cases/bulk-close')
def bulk_close(payload:Operation,x_user:str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); privileged(user); require_reason(payload.reason)
        selected=[item(data,'cases',id) for id in payload.ids]
        if not selected or any(c['status']!='En revision' for c in selected): raise HTTPException(409,'Selecciona casos en revision')
        for c in selected:
            c.update(status='Cerrada no inusual',reason=payload.reason,updated_at=now()); audit(data,user,'cierre en lote',c['id'],payload.reason)
        return {'closed':len(selected)}

@app.post('/api/cases/{id}/action')
def case_action(id:str,payload:Operation,x_user:str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); c=item(data,'cases',id)
        if payload.action=='comment':
            require_reason(payload.text); c['comments'].append(dict(user=x_user,text=payload.text,at=now()))
            for u in data['users']:
                if '@'+u['id'] in payload.text: data['notifications'].append(dict(id=uuid4().hex,user=u['id'],text=f'Mencion en {id}',case_id=id,at=now()))
        elif payload.action=='transition':
            require_reason(payload.reason)
            if payload.target not in TRANSITIONS[c['status']]: raise HTTPException(409,'Transicion no permitida')
            if c['status'] in ['En revision','Remitida a Cumplimiento']: privileged(user)
            if user['role']=='analyst' and c['assignee']!=x_user: raise HTTPException(403,'Solo el analista asignado puede avanzar el caso')
            if payload.target=='Inusual registrada':
                required=['operation_date','amount','currency','description','typology','analysis','evidence','decision','responsible']
                if any(not payload.fields.get(k,'').strip() for k in required): raise HTTPException(422,'Completa los nueve campos del registro inusual demo')
                c['unusual']=payload.fields
            if payload.target=='Remitida a Cumplimiento': c['suspicious_at']=now()
            if payload.target=='ROS aprobado':
                if user['role']!='officer': raise HTTPException(403,'Solo Cumplimiento aprueba ROS')
                if not c['ros'] or c['ros_author']==x_user: raise HTTPException(409,'Se requiere borrador de ROS preparado por otra persona')
                e=item(data,'entities',c['entity_id'])
                for other in data['entities']:
                    if other['id']!=e['id'] and any(other[k]==e[k] for k in ['cbu','beneficiary','device']): other['review_required']=True
            c.update(status=payload.target,reason=payload.reason)
        elif payload.action=='assign':
            privileged(user); require_reason(payload.reason); target=actor(data,payload.target)
            if sum(x['assignee']==target['id'] and x['status'] not in ['Cerrada no inusual','ROS aprobado'] for x in data['cases'])>=target['capacity']: raise HTTPException(409,'El analista alcanzo su capacidad')
            c['assignee']=target['id']
            if c['status']=='Nueva': c['status']='Asignada'
        elif payload.action=='snooze':
            require_reason(payload.reason)
            try: until=date.fromisoformat(payload.target)
            except ValueError: raise HTTPException(422,'Fecha invalida')
            if until<date.today(): raise HTTPException(422,'La pausa debe ser futura')
            c['snooze_until']=payload.target
        elif payload.action=='link':
            other=item(data,'cases',payload.target)
            if other['id']==id: raise HTTPException(422,'Selecciona otro caso')
            if other['id'] not in c['linked_cases']: c['linked_cases'].append(other['id']); other['linked_cases'].append(id)
        elif payload.action=='ros':
            if c['status']=='ROS aprobado': raise HTTPException(409,'ROS aprobado no editable')
            e=item(data,'entities',c['entity_id'])
            c['ros']=payload.text.strip() or f"BORRADOR DEMO - {id}\nEntidad: {e['name']}\nCUIT: {e['cuit']}\nNegocio: {c['business']}\nOperacion mas antigua: {c['oldest_operation']}\nMotivo: {c['explanation']}\nAnalisis: {c['reason']}\nRegistro: {json.dumps(c['unusual'],ensure_ascii=False)}\nRequiere revision del Oficial de Cumplimiento."
            c['ros_author']=x_user
        else: raise HTTPException(422,'Accion desconocida')
        c['updated_at']=now(); audit(data,user,payload.action,id,payload.reason or payload.text[:160]); return enrich_case(data,c)

class Attachment(Strict):
    name:str=Field(min_length=1,max_length=120)
    content:str=Field(max_length=2800000)

@app.post('/api/cases/{id}/attachments')
def attachment(id:str,payload:Attachment,x_user:str=Header(default='ana')):
    try: raw=base64.b64decode(payload.content,validate=True)
    except Exception: raise HTTPException(422,'Archivo invalido')
    if len(raw)>2_000_000: raise HTTPException(413,'Maximo 2 MB')
    if not payload.name.lower().endswith(('.pdf','.png','.jpg','.txt')): raise HTTPException(422,'Solo PDF, PNG, JPG o TXT')
    with state() as data:
        user=actor(data,x_user); c=item(data,'cases',id)
        c['attachments'].append(dict(id=uuid4().hex,name=payload.name,content=payload.content,size=len(raw),user=x_user,at=now()))
        audit(data,user,'adjuntar',id,payload.name); return {'ok':True}

@app.post('/api/preferences')
def preference(payload:Operation,x_user:str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user)
        if payload.action=='watch':
            item(data,'entities',payload.target)
            existing=next((w for w in data['watchlist'] if w['user']==x_user and w['entity_id']==payload.target),None)
            if existing: data['watchlist'].remove(existing)
            else: data['watchlist'].append(dict(user=x_user,entity_id=payload.target))
        elif payload.action=='view': data['saved_views'].append(dict(id=uuid4().hex,user=x_user,name=payload.text[:60],filters=payload.fields))
        else: raise HTTPException(422,'Accion desconocida')
        audit(data,user,payload.action,payload.target); return {'ok':True}

@app.get('/api/cases/{id}/attachments/{attachment_id}')
def download_attachment(id:str,attachment_id:str,x_user:str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); c=item(data,'cases',id)
        a=next((a for a in c['attachments'] if a['id']==attachment_id),None)
        if not a: raise HTTPException(404,'Adjunto inexistente')
        audit(data,user,'descargar adjunto',id,a['name'])
        return Response(base64.b64decode(a['content']),media_type='application/octet-stream')

def normalized(s): return ' '.join(sorted(''.join(c for c in unicodedata.normalize('NFD',s.lower()) if not unicodedata.combining(c)).split()))

@app.post('/api/screening/run')
def screening(x_user:str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); privileged(user); count=0
        for e in data['entities']:
            for l in data['lists']:
                score=max(SequenceMatcher(None,normalized(e[k]),normalized(l['name'])).ratio() for k in ['name','beneficiary'])
                if score<0.88: continue
                if any(h['entity_id']==e['id'] and h['list_id']==l['id'] and h['version']==l['version'] for h in data['screening']): continue
                data['screening'].append(dict(id=uuid4().hex,entity_id=e['id'],entity_name=e['name'],list_id=l['id'],source=l['source'],candidate=l['name'],version=l['version'],score=round(score*100,1),status='Pendiente',reason='',at=now())); count+=1
        audit(data,user,'screening','listas demo',str(count)); return {'new_matches':count}

@app.post('/api/screening/{id}/resolve')
def resolve_screening(id:str,payload:Operation,x_user:str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); h=item(data,'screening',id); require_reason(payload.reason)
        if payload.target not in ['Falso positivo','Confirmado']: raise HTTPException(422,'Decision invalida')
        h.update(status=payload.target,reason=payload.reason,resolved_by=x_user); audit(data,user,'resolver screening',id,payload.reason); return h

@app.post('/api/lists/revise')
def revise_lists(payload:Operation,x_user:str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); privileged(user); l=item(data,'lists',payload.target); l['version']+=1
        audit(data,user,'actualizar version lista demo',l['id']); return l

class Configuration(Strict):
    weights:dict[str,float]
    high:float=Field(gt=0,le=100)
    medium:float=Field(ge=0,lt=100)
    aggregation:Literal['worst','weighted','percentile']
    assignment:Literal['risk','fifo','random']
    quality_sample:int=Field(ge=0,le=100)
    regulatory_hours:int=Field(ge=1,le=168)
    operation_limit_days:int=Field(ge=1,le=365)

@app.put('/api/config')
def config(payload:Configuration,x_user:str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); privileged(user)
        if set(payload.weights)!=set(data['config']['weights']) or any(v<0 for v in payload.weights.values()) or abs(sum(payload.weights.values())-100)>0.01 or payload.medium>=payload.high: raise HTTPException(422,'Pesos deben sumar 100 y los umbrales deben estar ordenados')
        data['config']=payload.model_dump(); audit(data,user,'configurar matriz','config',json.dumps(data['config'])); return data['config']

@app.post('/api/segments/recalculate')
def recalculate(x_user:str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); privileged(user); cfg=data['config']
        for e in data['entities']:
            score=round(sum(e[k]*w/100 for k,w in cfg['weights'].items()),1)
            risk='Alto' if score>=cfg['high'] else 'Medio' if score>=cfg['medium'] else 'Bajo'
            e['risk_history'].append(dict(at=now(),before=e['score'],after=score,risk=risk)); e.update(score=score,risk=risk,segment=f"{e['business']} / {risk}")
        for e in data['entities']:
            siblings=[o for o in data['entities'] if o['cuit']==e['cuit']]; scores=sorted(o['score'] for o in siblings)
            e['group_score']=max(scores) if cfg['aggregation']=='worst' else scores[int((len(scores)-1)*0.9)] if cfg['aggregation']=='percentile' else round(sum(o['score']*o['declared_profile'] for o in siblings)/sum(o['declared_profile'] for o in siblings),1)
        audit(data,user,'recalcular segmentacion','cartera'); return {'count':len(data['entities'])}

@app.post('/api/team/delegate')
def delegate(payload:Operation,x_user:str=Header(default='ana')):
    with state() as data:
        user=actor(data,x_user); privileged(user); require_reason(payload.reason)
        source=actor(data,payload.text); target=actor(data,payload.target)
        if source['id']==target['id']: raise HTTPException(422,'Selecciona reemplazo distinto')
        pending=[c for c in data['cases'] if c['assignee']==source['id'] and c['status'] not in ['Cerrada no inusual','ROS aprobado']]
        count=sum(c['assignee']==target['id'] and c['status'] not in ['Cerrada no inusual','ROS aprobado'] for c in data['cases'])
        if count+len(pending)>target['capacity']: raise HTTPException(409,'El reemplazo no tiene capacidad suficiente')
        for c in pending: c['assignee']=target['id']; audit(data,user,'delegar por ausencia',c['id'],payload.reason)
        return {'reassigned':len(pending)}

@app.get('/api/export/{table}')
def export_table(table:str,q:str='',business:str='',status:str='',risk:str='',x_user:str=Header(default='ana')):
    from openpyxl import Workbook
    with state() as data:
        user=actor(data,x_user)
        if table not in ['cases','entities','rules','audit']: raise HTTPException(404,'Grilla inexistente')
        rows=[enrich_case(data,c) for c in data[table]] if table=='cases' else data[table]
        rows=[r for r in rows if (not q or q.lower() in json.dumps(r,ensure_ascii=False).lower()) and (not business or r.get('business')==business) and (not status or r.get('status')==status) and (not risk or r.get('risk')==risk)]
        audit(data,user,'exportar Excel',table,f'{len(rows)} filas; q={q}; business={business}; status={status}; risk={risk}')
        wb=Workbook(); ws=wb.active; ws.title=table
        keys=[k for k in rows[0] if k not in ['attachments','history','content']] if rows else ['Sin resultados']
        ws.append(keys)
        for r in rows:
            values=[]
            for k in keys:
                value=r.get(k,''); value=json.dumps(value,ensure_ascii=False) if isinstance(value,(list,dict)) else value
                if isinstance(value,str) and value.startswith(('=','+','-','@')): value="'"+value
                values.append(value)
            ws.append(values)
        ws.freeze_panes='A2'; ws.auto_filter.ref=ws.dimensions
        output=io.BytesIO(); wb.save(output)
        return Response(output.getvalue(),media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':f'attachment; filename="aml-{table}.xlsx"'})

@app.get('/api/cases/{id}/pdf')
def case_pdf(id:str,x_user:str=Header(default='ana')):
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    with state() as data:
        user=actor(data,x_user); c=enrich_case(data,item(data,'cases',id)); audit(data,user,'exportar PDF',id)
        output=io.BytesIO(); styles=getSampleStyleSheet(); story=[Paragraph('NEURAL CO | AML - Caso '+escape(id),styles['Title'])]
        for k in ['entity_name','cuit','business','status','risk','oldest_operation','deadline','explanation','reason','unusual','comments','linked_cases','ros']:
            value=c[k]; value=json.dumps(value,ensure_ascii=False) if isinstance(value,(list,dict)) else str(value)
            story.extend([Paragraph(escape(k),styles['Heading3']),Paragraph(escape(value).replace('\n','<br/>'),styles['BodyText']),Spacer(1,8)])
        story.append(Paragraph('Demostracion con datos sinteticos. No enviado a UIF.',styles['BodyText']))
        SimpleDocTemplate(output).build(story)
        return Response(output.getvalue(),media_type='application/pdf',headers={'Content-Disposition':f'attachment; filename="{id}.pdf"'})
