"""Isolated regression tests: never uses the project's live database."""
import base64
import io
import os
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

_directory = tempfile.TemporaryDirectory(prefix="greenpulse-security-")
os.environ["DATABASE_URL"] = "sqlite:///" + (Path(_directory.name) / "test.db").as_posix()
os.environ["ENVIRONMENT"] = "development"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"

from fastapi.testclient import TestClient
from PIL import Image
import main
from main import app
from database import engine, SessionLocal
import models
import security
from config import settings
from routers import classification

class SecurityTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        _directory.cleanup()

    def setUp(self):
        models.Base.metadata.drop_all(engine)
        models.Base.metadata.create_all(engine)
        security._buckets.clear()
        self.client = TestClient(app)
        self.password = "unique-test-password-123"
        with SessionLocal() as db:
            for uid, role in [(1, "Citizen"), (2, "Citizen"), (3, "Admin"), (4, "Driver"), (5, "Driver"), (6, "Admin")]:
                db.add(models.User(id=uid, name=f"Test {uid}", email=f"test{uid}@example.test", role=role,
                                   password_hash=security.hash_password(self.password), green_credits=0))
                db.add(models.AuthSession(token_hash=security.token_hash(f"test-token-{uid}"), user_id=uid,
                                          expires_at=time.time() + 1000))
            db.commit()
        image = io.BytesIO()
        Image.new("RGB", (8, 8), "green").save(image, format="PNG")
        self.photo = "data:image/png;base64," + base64.b64encode(image.getvalue()).decode()

    def headers(self, uid=1):
        return {"Authorization": f"Bearer test-token-{uid}"}

    def create(self):
        response = self.client.post('/reports', headers=self.headers(), json={
            "location_lat": 17.66, "location_lng": 75.9, "waste_type": "Waste overflow",
            "severity": "Medium", "image_url": self.photo,
            "consent_accepted": True, "policy_version": "2026-09-06"})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def move(self, rid, uid, status, **extra):
        return self.client.patch(f'/reports/{rid}/status', headers=self.headers(uid), json={"status": status, **extra})

    def classification_body(self, images=None, **extra):
        return {
            "images": images or [self.photo],
            "description": "Discarded drink bottle",
            "consent_accepted": True,
            "policy_version": "2026-09-12",
            **extra,
        }

    def test_anonymous_and_ownership(self):
        self.assertEqual(self.client.get('/reports').status_code, 401)
        self.assertEqual(self.client.post('/reports', json={}).status_code, 401)
        rid = self.create()
        self.assertEqual(self.client.get('/reports', headers=self.headers(2)).json(), [])
        self.assertEqual(self.client.get(f'/reports/{rid}', headers=self.headers(2)).status_code, 404)
        self.assertEqual(self.client.get(f'/reports/{rid}/audit', headers=self.headers(2)).status_code, 404)
        self.assertEqual(self.move(rid, 2, 'Citizen confirmed').status_code, 404)
        response = self.client.get('/reports', headers=self.headers())
        self.assertNotIn('citizen_id', response.json()[0])
        self.assertEqual(response.json()[0]['image_url'], '')

    def test_identity_and_role_injection(self):
        body = {"location_lat": 1, "location_lng": 1, "waste_type": "Test", "citizen_id": 2}
        self.assertEqual(self.client.post('/reports', headers=self.headers(), json=body).status_code, 422)
        response = self.client.post('/auth/register', json={"name": "Attacker", "email": "new@example.test",
                                   "password": self.password, "role": "Admin",
                                   "consent_accepted": True, "policy_version": "2026-09-06"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get('/auth/staff', headers=self.headers()).status_code, 403)

    def test_only_owner_can_create_staff_accounts(self):
        body = {"name": "Ward Admin", "email": "ward-admin@example.test",
                "password": self.password, "role": "Admin"}
        previous = settings.bootstrap_admin_email
        settings.bootstrap_admin_email = "test3@example.test"
        try:
            self.assertEqual(self.client.post('/auth/staff', headers=self.headers(1), json=body).status_code, 403)
            self.assertEqual(self.client.post('/auth/staff', headers=self.headers(6), json=body).status_code, 403)
            created = self.client.post('/auth/staff', headers=self.headers(3), json=body)
            self.assertEqual(created.status_code, 201, created.text)
            self.assertEqual(created.json()["user"]["role"], "Admin")
            self.assertNotIn("password_hash", created.text)
            self.assertEqual(self.client.post('/auth/staff', headers=self.headers(3), json=body).status_code, 409)
        finally:
            settings.bootstrap_admin_email = previous

    def test_only_owner_can_revoke_staff_access(self):
        previous = settings.bootstrap_admin_email
        settings.bootstrap_admin_email = "test3@example.test"
        try:
            listing = self.client.get('/auth/staff/manage', headers=self.headers(3))
            self.assertEqual(listing.status_code, 200, listing.text)
            self.assertTrue(any(account["is_owner"] for account in listing.json()))
            self.assertEqual(self.client.delete('/auth/staff/4', headers=self.headers(1)).status_code, 403)
            self.assertEqual(self.client.delete('/auth/staff/3', headers=self.headers(3)).status_code, 409)
            revoked = self.client.delete('/auth/staff/5', headers=self.headers(3))
            self.assertEqual(revoked.status_code, 200, revoked.text)
            self.assertEqual(self.client.get('/auth/me', headers=self.headers(5)).status_code, 401)
            with SessionLocal() as db:
                self.assertEqual(db.get(models.User, 5).role, "Disabled")
        finally:
            settings.bootstrap_admin_email = previous

    def test_cors_preflight_allows_staff_revocation(self):
        response = self.client.options('/auth/staff/5', headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "DELETE",
            "Access-Control-Request-Headers": "authorization",
        })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:5173")
        self.assertIn("DELETE", response.headers.get("access-control-allow-methods", ""))

    def test_judge_demo_seed_is_idempotent(self):
        previous_seed = settings.seed_demo_reports
        previous_owner = settings.bootstrap_admin_email
        settings.seed_demo_reports = True
        settings.bootstrap_admin_email = "test3@example.test"
        try:
            main.seed_judge_demo()
            main.seed_judge_demo()
            with SessionLocal() as db:
                demo = db.query(models.User).filter_by(email="judge-demo@greenpulse.local").one()
                reports = db.query(models.Report).filter_by(citizen_id=demo.id).all()
                self.assertEqual(len(reports), 6)
                self.assertEqual({report.status for report in reports},
                                 {"Pending", "Assigned", "In progress", "Cleaning", "Resolved", "Verified"})
        finally:
            settings.seed_demo_reports = previous_seed
            settings.bootstrap_admin_email = previous_owner

    def test_full_flow_rewards_and_no_replay(self):
        rid = self.create()
        self.assertEqual(self.move(rid, 1, 'Assigned', assigned_to=4).status_code, 403)
        self.assertEqual(self.move(rid, 3, 'Verified', scale='large', verification_note='fake').status_code, 409)
        self.assertEqual(self.move(rid, 3, 'Assigned', assigned_to=4).status_code, 200)
        self.assertEqual(self.move(rid, 5, 'In progress').status_code, 404)
        self.assertEqual(self.move(rid, 4, 'In progress').status_code, 200)
        self.assertEqual(self.move(rid, 4, 'Cleaning').status_code, 200)
        self.assertEqual(self.move(rid, 4, 'Resolved', completion_note='Done').status_code, 422)
        self.assertEqual(self.move(rid, 4, 'Resolved', completion_note='Collected and segregated', proof_image_url=self.photo).status_code, 200)
        self.assertEqual(self.move(rid, 4, 'Verified', scale='large', verification_note='fake').status_code, 403)
        response = self.move(rid, 3, 'Verified', scale='small', verification_note='Small pile removed; photo checked')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['reward_points'], 10)
        self.assertEqual(self.move(rid, 3, 'Verified', scale='large', verification_note='again').status_code, 409)
        self.assertEqual(self.client.get('/auth/me', headers=self.headers()).json()['green_credits'], 10)
        self.assertEqual(self.move(rid, 1, 'Citizen confirmed').status_code, 200)
        self.assertEqual(self.move(rid, 1, 'Citizen confirmed').status_code, 409)
        self.assertEqual(len(self.client.get(f'/reports/{rid}/audit', headers=self.headers()).json()), 7)

    def test_zero_reward_and_client_points_rejected(self):
        rid = self.create()
        self.move(rid, 3, 'Assigned', assigned_to=4)
        self.move(rid, 4, 'In progress')
        self.move(rid, 4, 'Cleaning')
        self.move(rid, 4, 'Resolved', completion_note='No waste found; site photographed', proof_image_url=self.photo)
        self.assertEqual(self.move(rid, 3, 'Verified', scale='false', verification_note='Confirmed', reward_points=10000).status_code, 422)
        self.assertEqual(self.move(rid, 3, 'Verified', scale='false', verification_note='No waste at location').status_code, 200)
        self.assertEqual(self.client.get('/auth/me', headers=self.headers()).json()['green_credits'], 0)

    def test_concurrent_verification_awards_once(self):
        rid = self.create()
        self.move(rid, 3, 'Assigned', assigned_to=4)
        self.move(rid, 4, 'In progress')
        self.move(rid, 4, 'Cleaning')
        self.move(rid, 4, 'Resolved', completion_note='Collected', proof_image_url=self.photo)
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.move(rid, 3, 'Verified', scale='medium', verification_note='Evidence checked').status_code, range(2)))
        self.assertEqual(sorted(results), [200, 409])
        self.assertEqual(self.client.get('/auth/me', headers=self.headers()).json()['green_credits'], 20)

    def test_sessions_passwords_logout(self):
        response = self.client.post('/auth/login', json={"email": "test1@example.test", "password": self.password})
        self.assertEqual(response.status_code, 200)
        token = response.json()['token']
        self.assertNotIn('password_hash', response.json()['user'])
        headers = {"Authorization": f"Bearer {token}"}
        self.assertEqual(self.client.post('/auth/logout', headers=headers).status_code, 204)
        self.assertEqual(self.client.get('/auth/me', headers=headers).status_code, 401)
        with SessionLocal() as db:
            session = db.get(models.AuthSession, security.token_hash('test-token-1'))
            session.expires_at = time.time() - 10
            db.commit()
        self.assertEqual(self.client.get('/auth/me', headers=self.headers()).status_code, 401)
        self.assertEqual(self.client.get('/auth/me', headers={"Authorization": "Bearer invalid"}).status_code, 401)

    def test_rate_limits(self):
        for _ in range(5):
            self.assertEqual(self.client.post('/auth/login', json={"email": "unknown@example.test", "password": self.password}).status_code, 401)
        self.assertEqual(self.client.post('/auth/login', json={"email": "unknown@example.test", "password": self.password}).status_code, 429)

    def test_input_upload_and_error_redaction(self):
        for image in ['https://internal.example/secret', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,bm90LWltYWdl']:
            response = self.client.post('/reports', headers=self.headers(), json={"waste_type": "Test", "location_lat": 1, "location_lng": 2, "image_url": image,
                                                                                  "consent_accepted": True, "policy_version": "2026-09-06"})
            self.assertEqual(response.status_code, 422)
            self.assertNotIn(image, response.text)
        response = self.client.post('/auth/login', json={"email": "bad", "password": "sensitive"})
        self.assertNotIn('sensitive', response.text)
        self.assertEqual(self.client.post('/reports', headers=self.headers(), content=b'x' * (3 * 1024 * 1024 + 1)).status_code, 413)
        rid = self.create()
        self.assertTrue(self.client.get(f'/reports/{rid}', headers=self.headers()).json()['image_url'].startswith('data:image/jpeg;base64,'))

    def test_classification_requires_citizen_consent_and_configuration(self):
        body = self.classification_body()
        self.assertEqual(self.client.post('/classification', json=body).status_code, 401)
        self.assertEqual(self.client.post('/classification', headers=self.headers(3), json=body).status_code, 403)
        no_consent = {key: value for key, value in body.items() if key != 'consent_accepted'}
        self.assertEqual(self.client.post('/classification', headers=self.headers(), json=no_consent).status_code, 422)
        wrong_policy = {**body, "policy_version": "2026-09-06"}
        self.assertEqual(self.client.post('/classification', headers=self.headers(), json=wrong_policy).status_code, 422)
        previous = settings.gemini_api_key
        settings.gemini_api_key = ""
        try:
            response = self.client.post('/classification', headers=self.headers(), json=body)
            self.assertEqual(response.status_code, 503)
            self.assertIn('not configured', response.json()['detail'])
            with SessionLocal() as db:
                self.assertEqual(db.query(models.ConsentEvent).count(), 0)
        finally:
            settings.gemini_api_key = previous

    def test_classification_status_is_truthful_and_citizen_only(self):
        previous = settings.gemini_api_key
        try:
            settings.gemini_api_key = ""
            unavailable = self.client.get('/classification/status', headers=self.headers())
            self.assertEqual(unavailable.status_code, 200, unavailable.text)
            self.assertFalse(unavailable.json()['available'])
            self.assertEqual(self.client.get('/classification/status', headers=self.headers(3)).status_code, 403)
            settings.gemini_api_key = "test-key"
            self.assertTrue(self.client.get('/classification/status', headers=self.headers()).json()['available'])
        finally:
            settings.gemini_api_key = previous

    def test_classification_is_structured_private_and_multi_photo(self):
        proposal = classification.ModelClassification(
            decision="classified", certainty="clear", item="plastic drink bottle",
            material="Plastic", reason="Bottle shape and plastic body are clearly visible",
            alternatives=[],
        )
        previous = settings.gemini_api_key
        settings.gemini_api_key = "test-key"
        try:
            with patch('routers.classification._call_gemini', return_value=proposal) as classify_mock:
                response = self.client.post(
                    '/classification', headers=self.headers(),
                    json=self.classification_body(images=[self.photo, self.photo]),
                )
            self.assertEqual(response.status_code, 200, response.text)
            result = response.json()
            self.assertEqual(result['decision'], 'classified')
            self.assertEqual(result['status'], 'classified')
            self.assertEqual(result['material'], 'Plastic')
            self.assertEqual(result['stream'], 'Dry')
            self.assertEqual(result['bin']['color'], 'blue')
            self.assertIsNone(result['recyclable'])
            self.assertNotIn('confidence', result)
            self.assertNotIn('images', result)
            sent = classify_mock.call_args.args[0]
            self.assertEqual(len(sent.images), 2)
            self.assertTrue(all(image.startswith('data:image/jpeg;base64,') for image in sent.images))
            with SessionLocal() as db:
                events = db.query(models.ConsentEvent).all()
                self.assertEqual(len(events), 1)
                self.assertEqual(events[0].purpose, 'Cloud AI waste classification')
                self.assertEqual(events[0].policy_version, '2026-09-12')
                self.assertEqual(db.query(models.Report).count(), 0)
        finally:
            settings.gemini_api_key = previous

    def test_gemini_3_uses_standard_json_schema(self):
        proposal = classification.ModelClassification(
            decision="need_more_photos", certainty="uncertain", item="unclear item",
            material="Unknown", reason="The image does not establish a waste material",
            follow_up_question="Add a clear close-up.",
        )
        captured = {}

        class FakeModels:
            def generate_content(self, *, model, contents, config):
                captured.update(model=model, contents=contents, config=config)
                return SimpleNamespace(parsed=proposal.model_dump(), text="")

        class FakeClient:
            models = FakeModels()

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

        previous_key = settings.gemini_api_key
        previous_model = settings.gemini_model
        settings.gemini_api_key = "test-key"
        settings.gemini_model = "gemini-3.6-flash"
        try:
            with patch('routers.classification.genai.Client', return_value=FakeClient()):
                result = classification._call_gemini(
                    classification.ClassificationRequest(**self.classification_body())
                )
            self.assertEqual(result, proposal)
            self.assertEqual(captured['model'], 'gemini-3.6-flash')
            self.assertIsNone(captured['config'].temperature)
            self.assertEqual(captured['config'].thinking_config.thinking_level.value, 'MINIMAL')
            self.assertIsNone(captured['config'].thinking_config.thinking_budget)
            self.assertIsNone(captured['config'].response_schema)
            self.assertEqual(captured['config'].response_mime_type, 'application/json')
            schema = captured['config'].response_json_schema
            self.assertEqual(schema['type'], 'object')
            self.assertFalse(schema['additionalProperties'])
            self.assertIn('decision', schema['required'])
        finally:
            settings.gemini_api_key = previous_key
            settings.gemini_model = previous_model

    def test_classification_abstains_when_model_is_uncertain(self):
        proposal = classification.ModelClassification(
            decision="classified", certainty="uncertain", item="partly hidden container",
            material="Plastic", reason="The material is obscured",
            alternatives=["Metal", "Mixed or composite"],
        )
        previous = settings.gemini_api_key
        settings.gemini_api_key = "test-key"
        try:
            with patch('routers.classification._call_gemini', return_value=proposal):
                response = self.client.post('/classification', headers=self.headers(),
                                            json=self.classification_body())
            self.assertEqual(response.status_code, 200, response.text)
            result = response.json()
            self.assertEqual(result['decision'], 'need_more_photos')
            self.assertEqual(result['status'], 'needs_more_evidence')
            self.assertTrue(result['needs_more_information'])
            self.assertTrue(result['follow_up_question'])
            self.assertTrue(result['user_review']['can_correct'])
        finally:
            settings.gemini_api_key = previous

    def test_classification_does_not_invent_official_bin_colours(self):
        special = classification._normalise(classification.ModelClassification(
            decision="classified", certainty="clear", item="used battery",
            material="E-waste", reason="A battery form and terminals are visible",
        ))
        self.assertEqual(special.stream, 'Special care')
        self.assertEqual(special.bin.color, '')
        self.assertIn('No standard bin colour', special.bin.label)

        not_waste = classification._normalise(classification.ModelClassification(
            decision="not_waste", certainty="clear", item="park bench",
            material="Not waste", reason="The object is installed street furniture",
        ))
        self.assertEqual(not_waste.decision, 'not_waste')
        self.assertIn('not to be waste', not_waste.guidance)
        self.assertNotIn('Isolate', not_waste.guidance)

    def test_classification_limits_images_and_redacts_provider_failure(self):
        self.assertEqual(self.client.post(
            '/classification', headers=self.headers(),
            json=self.classification_body(images=[self.photo] * 4),
        ).status_code, 422)
        self.assertEqual(self.client.post(
            '/classification', headers=self.headers(),
            json=self.classification_body(images=['data:image/svg+xml;base64,PHN2Zz4=']),
        ).status_code, 422)
        oversized = "data:image/jpeg;base64," + base64.b64encode(
            b'x' * (classification.MAX_TOTAL_IMAGE_BYTES // 2 + 1)).decode()
        with patch('routers.classification.validate_image', return_value=oversized):
            with self.assertRaises(ValueError):
                classification.ClassificationRequest(**self.classification_body(images=['a', 'b']))

        previous = settings.gemini_api_key
        settings.gemini_api_key = "test-key"
        try:
            with patch('routers.classification._call_gemini', side_effect=RuntimeError('secret-provider-detail')):
                response = self.client.post('/classification', headers=self.headers(),
                                            json=self.classification_body())
            self.assertEqual(response.status_code, 503)
            self.assertNotIn('secret-provider-detail', response.text)
            self.assertIn('No result was saved', response.json()['detail'])
        finally:
            settings.gemini_api_key = previous

    def test_classification_is_throttled_per_citizen(self):
        proposal = classification.ModelClassification(
            decision="classified", certainty="clear", item="food peel",
            material="Organic or food", reason="A food peel is clearly visible",
        )
        previous = settings.gemini_api_key
        settings.gemini_api_key = "test-key"
        try:
            with patch('routers.classification._call_gemini', return_value=proposal):
                for _ in range(10):
                    response = self.client.post('/classification', headers=self.headers(),
                                                json=self.classification_body())
                    self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(self.client.post('/classification', headers=self.headers(),
                                                  json=self.classification_body()).status_code, 429)
        finally:
            settings.gemini_api_key = previous

    def test_cors_and_no_store(self):
        bad = self.client.options('/reports', headers={"Origin": "https://attacker.example", "Access-Control-Request-Method": "GET"})
        self.assertEqual(bad.status_code, 400)
        good = self.client.options('/reports', headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
        self.assertEqual(good.status_code, 200)
        response = self.client.get('/reports', headers=self.headers())
        self.assertEqual(response.headers['cache-control'], 'no-store')
        self.assertEqual(response.headers['x-content-type-options'], 'nosniff')

    def test_legacy_orphan_reports_not_claimed(self):
        with SessionLocal() as db:
            db.add(models.Report(citizen_id=99, image_url='', location_lat=1, location_lng=1, waste_type='Legacy', severity='Low'))
            db.commit()
        response = self.client.post('/auth/register', json={"name": "New person", "email": "new@example.test", "password": self.password,
                                                              "consent_accepted": True, "policy_version": "2026-09-06"})
        self.assertEqual(response.status_code, 201)
        with SessionLocal() as db:
            user = db.query(models.User).filter_by(email='new@example.test').one()
            self.assertGreater(user.id, 99)
            self.assertEqual(user.role, 'Citizen')
            self.assertTrue(user.password_hash.startswith('scrypt$'))

    def test_consent_is_required_and_recorded(self):
        missing = self.client.post('/auth/register', json={
            "name": "No Consent", "email": "no-consent@example.test", "password": self.password})
        self.assertEqual(missing.status_code, 422)
        response = self.client.post('/auth/register', json={
            "name": "Consenting person", "email": "consent@example.test", "password": self.password,
            "consent_accepted": True, "policy_version": "2026-09-06"})
        self.assertEqual(response.status_code, 201, response.text)
        rid = self.create()
        with SessionLocal() as db:
            events = db.query(models.ConsentEvent).order_by(models.ConsentEvent.id).all()
            self.assertEqual([event.purpose for event in events], ["Account registration", f"Report {rid} submission"])
            self.assertTrue(all(event.policy_version == "2026-09-06" for event in events))

if __name__ == '__main__':
    unittest.main()
