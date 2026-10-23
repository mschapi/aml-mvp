import io
import os
import tempfile
import unittest
from datetime import date,timedelta
from pathlib import Path

temp=tempfile.TemporaryDirectory()
os.environ['AML_DB_PATH']=str(Path(temp.name)/'tests.db')
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from main import app
from domain import matches
client=TestClient(app)

def post(path,payload=None,user='ana'):
    return client.post('/api'+path,json=payload or {},headers={'X-User':user})

class WorkflowTests(unittest.TestCase):
    def test_01_four_eyes_and_validation(self):
        base=dict(name='Escenario de prueba',business='Adquirencia pesos',window_days=30,severity='Alto',conditions=[dict(field='profile_ratio',operator='>',value=1)])
        bad={**base,'conditions':[dict(field='sql',operator='>',value=1)]}
        self.assertEqual(post('/rules',bad).status_code,422)
        self.assertEqual(post('/rules',{**base,'code':'import os'}).status_code,422)
        r=post('/rules',base,user='sofia').json(); rid=r['id']
        self.assertEqual(post(f'/rules/{rid}/action',dict(action='submit',reason='Solicitud de prueba'),user='sofia').status_code,409)
        sim=post(f'/rules/{rid}/simulate',dict(start_date=(date.today()-timedelta(days=179)).isoformat(),end_date=date.today().isoformat()),user='sofia')
        self.assertEqual(sim.status_code,200);self.assertGreater(sim.json()['matched_entities'],0)
        self.assertEqual(post(f'/rules/{rid}/action',dict(action='submit',reason='Resultados revisados'),user='sofia').status_code,200)
        self.assertEqual(post(f'/rules/{rid}/action',dict(action='approve',reason='Aprobacion propia'),user='sofia').status_code,403)
        self.assertEqual(post(f'/rules/{rid}/action',dict(action='approve',reason='Aprobacion independiente'),user='oficial').status_code,200)
        self.assertEqual(client.put('/api/rules/'+rid,json=base).status_code,409)

    def test_02_case_lifecycle(self):
        c=post('/cases/next').json(); cid=c['id']
        self.assertEqual(post(f'/cases/{cid}/action',dict(action='transition',target='En analisis',reason='Revision de antecedentes'),user='lucas').status_code,403)
        for target in ['En analisis','En revision']:
            self.assertEqual(post(f'/cases/{cid}/action',dict(action='transition',target=target,reason='Revision de antecedentes')).status_code,200)
        payload=dict(action='transition',target='Inusual registrada',reason='Operacion sin justificacion')
        self.assertEqual(post(f'/cases/{cid}/action',payload,user='sofia').status_code,422)
        payload['fields']={k:'dato sintetico' for k in ['operation_date','amount','currency','description','typology','analysis','evidence','decision','responsible']}
        self.assertEqual(post(f'/cases/{cid}/action',payload,user='sofia').status_code,200)
        self.assertEqual(post(f'/cases/{cid}/action',dict(action='ros'),user='sofia').status_code,200)
        self.assertEqual(post(f'/cases/{cid}/action',dict(action='transition',target='Remitida a Cumplimiento',reason='Elevar revision formal'),user='sofia').status_code,200)
        result=post(f'/cases/{cid}/action',dict(action='transition',target='ROS aprobado',reason='Revision y aprobacion formal'),user='oficial')
        self.assertEqual(result.status_code,200);self.assertLessEqual(result.json()['hours_remaining'],24)
        pdf=client.get(f'/api/cases/{cid}/pdf');self.assertEqual(pdf.status_code,200);self.assertTrue(pdf.content.startswith(b'%PDF'))

    def test_03_screening_suppression_and_version(self):
        self.assertEqual(post('/screening/run').status_code,403)
        first=post('/screening/run',user='sofia').json();self.assertGreater(first['new_matches'],0)
        hit=client.get('/api/bootstrap').json()['screening'][0]
        self.assertEqual(post('/screening/'+hit['id']+'/resolve',dict(action='resolve',target='Falso positivo',reason='Identidad distinta verificada')).status_code,200)
        self.assertEqual(post('/screening/run',user='sofia').json()['new_matches'],0)
        post('/lists/revise',dict(action='revise',target=hit['list_id']),user='sofia')
        self.assertGreater(post('/screening/run',user='sofia').json()['new_matches'],0)

    def test_04_exports_and_weights(self):
        b=client.get('/api/bootstrap').json(); cfg=b['config']
        bad={**cfg,'weights':{**cfg['weights'],'activity_risk':90}}
        self.assertEqual(client.put('/api/config',json=bad,headers={'X-User':'sofia'}).status_code,422)
        self.assertEqual(post('/segments/recalculate',user='sofia').status_code,200)
        response=client.get('/api/export/cases?business=Cuenta%20Payway')
        self.assertEqual(response.status_code,200)
        rows=list(load_workbook(io.BytesIO(response.content)).active.values);business=rows[0].index('business')
        self.assertTrue(all(row[business]=='Cuenta Payway' for row in rows[1:]))
        self.assertTrue(any(a['action']=='exportar Excel' for a in client.get('/api/bootstrap').json()['audit']))

    def test_05_idempotency_and_date_validation(self):
        result=post('/monitor/run',user='sofia');self.assertEqual(result.status_code,200)
        self.assertEqual(post('/monitor/run',user='sofia').json()['generated'],0)
        self.assertEqual(post('/rules/R001/simulate',dict(start_date='2026-10-02',end_date='2026-10-01')).status_code,422)
        self.assertTrue(matches({'conditions':[{'field':'volume','operator':'>=','value':100}]},{'volume':100}))
        self.assertFalse(matches({'conditions':[{'field':'volume','operator':'>','value':100}]},{'volume':100}))

if __name__=='__main__': unittest.main()
