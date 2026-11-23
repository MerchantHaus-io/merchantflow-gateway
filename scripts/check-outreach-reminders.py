"""Two-phase live reminder test. No emails/calls; temporary rows are removed.

1. python3 scripts/check-outreach-reminders.py prepare
2. Run SELECT public.outreach_notify_due() twice through the privileged data tool.
3. python3 scripts/check-outreach-reminders.py verify
"""
import importlib.util
import json
import sys
from pathlib import Path


spec = importlib.util.spec_from_file_location('cadence_checks', Path(__file__).with_name('check-outreach-cadence.py'))
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load cadence check helper')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
checks = module.OutreachCadenceChecks
fixture = Path('/tmp/outreach-reminder-fixture.json')

if sys.argv[1] == 'prepare':
    checks.setUpClass()
    case = checks()
    enrollment = case.enroll(start_on='2026-11-23')
    fixture.write_text(json.dumps({'campaign': checks.campaign, 'enrollment': enrollment, 'tenant': checks.tenant}))
    print('Prepared one due contact; no contact communication sent.')
elif sys.argv[1] == 'verify':
    if not fixture.exists():
        raise RuntimeError('Prepare a reminder fixture first')
    saved = json.loads(fixture.read_text())
    checks.setUpClass()
    # Delete the fresh setup campaign; then inspect and clean the original fixture.
    checks.tearDownClass()
    checks.campaign = saved['campaign']
    notes = []
    try:
        notes = checks.request('GET', 'notifications', params={
            'link': 'eq./outreach/' + checks.campaign['id'], 'user_id': 'eq.' + checks.user})
        assert len(notes) == 1, 'Due touch must create exactly one notification across two checks'
        assert notes[0]['tenant_id'] == saved['tenant'], 'Reminder must stay in its organisation'
        assert notes[0]['user_email'].lower() == checks.email.lower(), 'Reminder must reach the assigned person'
        assert 'Touch 1/12' in notes[0]['message'], 'Reminder must identify the next incomplete touch'
        touches = checks().touches(saved['enrollment'])
        assert touches[0]['notified_at'] is not None, 'Due touch must be claimed'
        assert all(t['notified_at'] is None for t in touches[1:]), 'Later steps cannot notify ahead of earlier steps'
        print('PASS: one next-step alert, correct assignee and organisation, duplicate-free, later steps withheld.')
    finally:
        for note in notes:
            checks.request('DELETE', 'notifications', params={'id': 'eq.' + note['id']})
        checks.tearDownClass()
        fixture.unlink(missing_ok=True)
else:
    raise RuntimeError('Use prepare or verify')