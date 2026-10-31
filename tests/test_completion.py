"""Owner Done is an authenticated completion signal, not browser shutdown."""
import time
import unittest
from test_front import load_front

class CompletionTests(unittest.TestCase):
    def setUp(self):
        self.f=load_front()
        self.f['HANDOFF'].update(session_id='session1',token='A'*32,expires_at=time.time()+60,
            started_at=time.time(),purpose='login',note='',tab_id='T1',base_url=None)
        self.calls=[]
        self.f['_engine']=lambda *args,**kw: self.calls.append(args) or {'ok':True,'active':False}

    def test_done_requires_capability_and_post(self):
        route=self.f['route']
        self.assertEqual(route('POST','/handoff/done',{})[1],401)
        self.assertEqual(route('GET','/handoff/done',{})[1],405)
        self.assertFalse(self.calls)

    def test_done_revokes_stream_but_keeps_completion_receipt(self):
        headers={'cookie':'browser_handoff='+'A'*32}
        self.assertEqual(self.f['route']('POST','/handoff/done',headers)[1],200)
        self.assertEqual(self.calls,[('DELETE','/session')])
        self.assertFalse(self.f['_active']())
        self.assertEqual(self.f['route']('GET','/handoff/websockify',headers)[1],401)
        state=self.f['_handoff_public']()
        self.assertFalse(state['active'])
        self.assertTrue(state['owner_done'])
        self.assertIsInstance(state['completed_at'],int)
        self.assertEqual(self.f['HANDOFF']['tab_id'],'T1')

    def test_every_forwarded_header_is_rejected_for_devtools(self):
        for k in ['x-forwarded-prefix','x-forwarded-uri','x-forwarded-client-cert','via','x-real-ip','tailscale-user-profile-pic']:
            self.assertEqual(self.f['route']('GET','/json/version',{k:'x'})[1],403,k)

if __name__=='__main__': unittest.main()
