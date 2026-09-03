"""Isolated regression tests: never uses the project's live database."""
import base64
import io
import os
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

_directory = tempfile.TemporaryDirectory(prefix="greenpulse-security-")
os.environ["DATABASE_URL"] = "sqlite:///" + (Path(_directory.name) / "test.db").as_posix()
os.environ["ENVIRONMENT"] = "development"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"

from fastapi.testclient import TestClient
from PIL import Image
from main import app
from database import engine, SessionLocal
import models
import security

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
            for uid, role in [(1, "Citizen"), (2, "Citizen"), (3, "Admin"), (4, "Driver"), (5, "Driver")]:
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
            "severity": "Medium", "image_url": self.photo})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def move(self, rid, uid, status, **extra):
        return self.client.patch(f'/reports/{rid}/status', headers=self.headers(uid), json={"status": status, **extra})

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
                                   "password": self.password, "role": "Admin"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get('/auth/staff', headers=self.headers()).status_code, 403)

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
            response = self.client.post('/reports', headers=self.headers(), json={"waste_type": "Test", "location_lat": 1, "location_lng": 2, "image_url": image})
            self.assertEqual(response.status_code, 422)
            self.assertNotIn(image, response.text)
        response = self.client.post('/auth/login', json={"email": "bad", "password": "sensitive"})
        self.assertNotIn('sensitive', response.text)
        self.assertEqual(self.client.post('/reports', headers=self.headers(), content=b'x' * (3 * 1024 * 1024 + 1)).status_code, 413)
        rid = self.create()
        self.assertTrue(self.client.get(f'/reports/{rid}', headers=self.headers()).json()['image_url'].startswith('data:image/jpeg;base64,'))

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
        response = self.client.post('/auth/register', json={"name": "New person", "email": "new@example.test", "password": self.password})
        self.assertEqual(response.status_code, 201)
        with SessionLocal() as db:
            user = db.query(models.User).filter_by(email='new@example.test').one()
            self.assertGreater(user.id, 99)
            self.assertEqual(user.role, 'Citizen')
            self.assertTrue(user.password_hash.startswith('scrypt$'))

if __name__ == '__main__':
    unittest.main()
