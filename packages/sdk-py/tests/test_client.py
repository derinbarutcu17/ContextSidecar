from __future__ import annotations

import io
import json
import sys
import unittest
from pathlib import Path
from urllib import error
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(ROOT))

from synthkit_sdk import SynthKitApiError, SynthKitClient  # noqa: E402


class FakeResponse:
    def __init__(self, payload: dict, status: int = 200):
        self.payload = payload
        self.status = status

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class SynthKitClientTests(unittest.TestCase):
    def setUp(self):
        self.calls = []

    def fake_urlopen(self, req, timeout=None):
        self.calls.append((req.full_url, req.method, timeout, req.data))
        path = req.full_url.split("http://example.test", 1)[1]
        body = json.loads(req.data.decode("utf-8")) if req.data else {}
        if path == "/v1/health":
            return FakeResponse({"ok": True, "data": {"status": "ok", "rootPath": "/tmp"}})
        if path == "/v1/version":
            return FakeResponse({"ok": True, "data": {"version": "0.1.0"}})
        if path == "/v1/capabilities":
            return FakeResponse({"ok": True, "data": {"schemaVersion": 1, "id": "capabilities"}})
        if path == "/v1/projects" and req.method == "POST":
            return FakeResponse({"ok": True, "data": {"id": "project_1", "schemaVersion": 1, "name": body["name"]}})
        if path == "/v1/projects/project_1" and req.method == "GET":
            return FakeResponse({"ok": True, "data": {"id": "project_1", "schemaVersion": 1, "name": "Research"}})
        if path.endswith("/ingest/text"):
            return FakeResponse({"ok": True, "data": {"source": {"id": "source_1"}, "chunks": [], "assets": [], "warnings": []}})
        if path.endswith("/synthesize"):
            return FakeResponse({"ok": True, "data": {"request": {"id": "synth_1"}, "draft": {"id": "draft_1"}}})
        if path.endswith("/draft"):
            return FakeResponse({"ok": True, "data": {"schemaVersion": 1, "id": "draft_1"}})
        if path.endswith("/citations") or path.endswith("/contradictions") or path.endswith("/revisions") or path.endswith("/stages"):
            return FakeResponse({"ok": True, "data": []})
        if path.endswith("/export"):
            return FakeResponse({"ok": True, "data": {"id": "export_1", "format": body.get("format", "markdown")}})
        raise FakeHttpError(404, {"error": {"message": "not found"}})

    @patch("synthkit_sdk.client.request.urlopen")
    def test_end_to_end_workflow(self, mock_urlopen):
        mock_urlopen.side_effect = self.fake_urlopen
        client = SynthKitClient("http://example.test")
        self.assertEqual(client.health()["status"], "ok")
        project = client.create_project("Research", description="Notes")
        self.assertEqual(project["id"], "project_1")
        client.ingest_text(project["id"], "Messy notes", title="Notes")
        bundle = client.synthesize(project["id"], "brief", "Research brief")
        self.assertEqual(bundle["draft"]["id"], "draft_1")
        self.assertEqual(client.get_draft("draft_1")["id"], "draft_1")
        self.assertEqual(client.get_citations("draft_1"), [])
        self.assertEqual(client.get_contradictions("draft_1"), [])
        self.assertEqual(client.get_revisions("draft_1"), [])
        self.assertEqual(client.export_markdown("draft_1")["format"], "markdown")
        self.assertEqual(client.get_stages("draft_1"), [])

    @patch("synthkit_sdk.client.request.urlopen")
    def test_http_error_surface(self, mock_urlopen):
        def boom(req, timeout=None):
            payload = json.dumps({"error": {"message": "missing"}}).encode("utf-8")
            fp = io.BytesIO(payload)
            raise error.HTTPError(req.full_url, 404, "not found", hdrs=None, fp=fp)

        mock_urlopen.side_effect = boom
        client = SynthKitClient("http://example.test")
        with self.assertRaises(SynthKitApiError) as exc:
            client.get_project("missing")
        self.assertEqual(exc.exception.status, 404)


if __name__ == "__main__":
    unittest.main()
