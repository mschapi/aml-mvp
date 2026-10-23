import random
from datetime import datetime, timedelta, timezone

BUSINESSES = ['Adquirencia pesos', 'Adquirencia dolares', 'Devoluciones', 'Cuenta Payway']
USERS = [dict(id='ana', name='Ana Martinez', role='analyst', capacity=12), dict(id='lucas', name='Lucas Perez', role='analyst', capacity=12), dict(id='sofia', name='Sofia Ruiz', role='supervisor', capacity=20), dict(id='oficial', name='Oficial de Cumplimiento', role='officer', capacity=20)]
CATALOG = [
    dict(field='profile_ratio', label='Volumen / perfil declarado', type='number', unit='veces'),
    dict(field='volume', label='Volumen de operaciones', type='number', unit='moneda del negocio'),
    dict(field='refund_ratio', label='Devoluciones / ventas', type='number', unit='%'),
    dict(field='outflow_ratio', label='Salida / entrada de fondos', type='number', unit='%'),
    dict(field='card_concentration', label='Concentracion de tarjetas', type='number', unit='%'),
    dict(field='counterparties', label='Contrapartes distintas', type='number', unit='cantidad'),
    dict(field='age_days', label='Antiguedad del cliente', type='number', unit='dias'),
    dict(field='device_accounts', label='Cuentas por dispositivo', type='number', unit='cantidad'),
    dict(field='unlinked_refunds', label='Devoluciones sin venta', type='number', unit='cantidad'),
]
STATES = ['Nueva', 'Asignada', 'En analisis', 'En revision', 'Cerrada no inusual', 'Inusual registrada', 'Remitida a Cumplimiento', 'ROS aprobado']
TRANSITIONS = {'Nueva':['Asignada'], 'Asignada':['En analisis'], 'En analisis':['En revision'], 'En revision':['En analisis','Cerrada no inusual','Inusual registrada'], 'Inusual registrada':['Remitida a Cumplimiento'], 'Remitida a Cumplimiento':['En analisis','ROS aprobado'], 'Cerrada no inusual':[], 'ROS aprobado':[]}

def now():
    return datetime.now(timezone.utc).isoformat()

def initial_data():
    rng = random.Random(42)
    today = datetime.now(timezone.utc).date()
    entities, transactions = [], []
    names = ['Horizonte', 'Delta', 'Litoral', 'Andina', 'Sur', 'Centro', 'Pampa', 'Norte']
    for i in range(32):
        business = BUSINESSES[i % 4]
        entities.append(dict(id=f'E{i+1:03}', name=f'{names[i%8]} {i+1:02} SA (demo)', cuit=f'30{70000000+i//2:08}9', establishment=f'EST-{i+1:04}', subclient=f'SUB-{i+1:04}', business=business, activity=['Retail','Servicios','Turismo','Comercio digital'][i%4], jurisdiction=['Argentina','Argentina','Frontera','Exterior'][i%4], cbu=f'DEMO-CBU-{i//3:04}', beneficiary=f'Beneficiario demo {i//4+1}', device=f'DEV-{i//2:03}', address=f'Domicilio sintetico {i//3}', pep=i%9==0, declared_profile=500000 if business!='Adquirencia dolares' else 3000, age_days=15 if i%5==0 else 420, activity_risk=[25,45,70,85][i%4], jurisdiction_risk=[20,20,70,90][i%4], behavior_risk=20+(i*17)%80, ownership_risk=80 if i%9==0 else 25, risk='Medio', score=45, segment=f'{business} / {i%3+1}', documents=[dict(name='Legajo sintetico', status='Vencido' if i%7==0 else 'Vigente')], risk_history=[]))
    for i in range(6000):
        e=entities[i%32]
        day=today-timedelta(days=rng.randrange(180))
        amount=round(rng.uniform(1000,45000)*(4 if i%32<4 else 1),2)
        if e['business']=='Adquirencia dolares': amount=round(amount/1200,2)
        transactions.append(dict(id=f'TX-{i+1:06}', entity_id=e['id'], date=day.isoformat(), amount=amount, currency='USD' if e['business']=='Adquirencia dolares' else 'ARS', card=f'TOKEN-{rng.randrange(4 if i%32<4 else 90):03}', counterparty=f'CP-{rng.randrange(50):03}', refund=rng.random()<(0.4 if i%32<4 else 0.06), original_found=rng.random()>0.12, outflow=round(amount*(0.96 if i%32<8 else rng.random()*0.6),2)))
    rules=[]
    specs=[('Volumen fuera del perfil',0,'profile_ratio','>',2,30),('Comercio nuevo con volumen alto',0,'age_days','<',60,30),('Concentracion de tarjetas',1,'card_concentration','>',55,30),('Devoluciones sin venta original',2,'unlinked_refunds','>',0,30),('Ratio elevado de devoluciones',2,'refund_ratio','>',20,30),('Entrada y salida acelerada',3,'outflow_ratio','>',90,2),('Dispositivo compartido',3,'device_accounts','>=',2,30)]
    for i,(name,b,field,op,value,window) in enumerate(specs):
        rules.append(dict(id=f'R{i+1:03}', name=name, business=BUSINESSES[b], conditions=[dict(field=field,operator=op,value=value)], window_days=window, severity='Alto' if i%2==0 else 'Medio', status='active', version=1, author='sofia', approver='oficial', updated_at=now(), history=[], last_simulation=None))
    cases=[]
    for i in range(18):
        e=entities[i]
        cases.append(dict(id=f'C{i+1:04}', entity_id=e['id'], rule_id=rules[i%7]['id'], title=['Desvio del perfil transaccional','Concentracion de operaciones','Patron de devoluciones'][i%3], business=e['business'], risk='Alto' if i%3==0 else 'Medio', status=STATES[i%4], assignee=['ana','lucas',None][i%3], created_at=now(), oldest_operation=(today-timedelta(days=80 if i==0 else 15+i)).isoformat(), suspicious_at=None, explanation=f'Escenario sintetico: indicador observado {3+i/10:.1f} frente a umbral 2.0.', observed=3+i/10, threshold=2, reason='', unusual={}, comments=[], attachments=[], linked_cases=[], snooze_until=None, ros='', ros_author=None, updated_at=now()))
    for e in entities:
        e['score']=round(e['activity_risk']*.25+e['jurisdiction_risk']*.25+e['behavior_risk']*.30+e['ownership_risk']*.20,1)
        e['risk']='Alto' if e['score']>=65 else 'Medio' if e['score']>=35 else 'Bajo'
        e['segment']=f"{e['business']} / {e['risk']}"
    for c in cases:
        c['assignee']=None if c['status']=='Nueva' else ['ana','lucas'][int(c['id'][1:])%2]
    return dict(entities=entities,transactions=transactions,rules=rules,cases=cases,users=USERS, audit=[], notifications=[], saved_views=[],watchlist=[],screening=[],list_version=1,lists=[dict(id='L1',name=entities[0]['name'],source='RePET DEMO',version=1),dict(id='L2',name='Sur 05 SA (demo)',source='OFAC DEMO',version=1),dict(id='L3',name='Beneficiario demo 3',source='PEP DEMO',version=1)], config=dict(weights=dict(activity_risk=25,jurisdiction_risk=25,behavior_risk=30,ownership_risk=20),high=65,medium=35,aggregation='worst',assignment='risk',quality_sample=10,regulatory_hours=24,operation_limit_days=90), runs=[])

def metrics(data, entity, start, end):
    tx=[t for t in data['transactions'] if t['entity_id']==entity['id'] and start<=t['date']<=end]
    volume=sum(t['amount'] for t in tx)
    cards={}
    for t in tx: cards[t['card']]=cards.get(t['card'],0)+t['amount']
    return dict(volume=round(volume,2),profile_ratio=round(volume/entity['declared_profile'],2),refund_ratio=round(100*sum(t['amount'] for t in tx if t['refund'])/volume,2) if volume else 0,outflow_ratio=round(100*sum(t['outflow'] for t in tx)/volume,2) if volume else 0,card_concentration=round(100*sum(sorted(cards.values(),reverse=True)[:3])/volume,2) if volume else 0,counterparties=len({t['counterparty'] for t in tx}),age_days=entity['age_days'],device_accounts=sum(e['device']==entity['device'] for e in data['entities']),unlinked_refunds=sum(t['refund'] and not t['original_found'] for t in tx),transaction_count=len(tx))

def matches(rule, values):
    import operator
    ops={'==':operator.eq,'!=':operator.ne,'>':operator.gt,'>=':operator.ge,'<':operator.lt,'<=':operator.le}
    return all(ops[c['operator']](values[c['field']],c['value']) for c in rule['conditions'])

def evaluate(data, rule, start, end):
    start_date=datetime.fromisoformat(start).date(); end_date=datetime.fromisoformat(end).date()
    found={}
    cursor=start_date
    while cursor<=end_date:
        window_end=min(cursor+timedelta(days=rule['window_days']-1),end_date)
        for e in data['entities']:
            if e['business']!=rule['business']: continue
            values=metrics(data,e,cursor.isoformat(),window_end.isoformat())
            if values['transaction_count'] and matches(rule,values):
                found[e['id']]=dict(entity_id=e['id'],name=e['name'],values=values,period_start=cursor.isoformat(),period_end=window_end.isoformat())
        cursor=window_end+timedelta(days=1)
    return list(found.values())
