from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Literal, Mapping, TypedDict, cast
from urllib import error, parse, request

SynthesisMode = Literal["brief", "decision_memo", "deck_outline"]
JsonDict = dict[str, Any]


class SynthKitApiError(RuntimeError):
    def __init__(self, message: str, *, code: str = "client_error", status: int | None = None, details: Any = None):
        super().__init__(message)
        self.code = code
        self.status = status
        self.details = details


class ProjectInput(TypedDict, total=False):
    name: str
    description: str
    defaultMode: SynthesisMode


class TextIngestInput(TypedDict, total=False):
    text: str
    markdown: str
    title: str
    provenance: dict[str, Any]


class UrlIngestInput(TypedDict, total=False):
    url: str
    title: str


class FileIngestInput(TypedDict, total=False):
    filePath: str
    title: str


class TranscriptIngestInput(TypedDict, total=False):
    transcript: str
    title: str


class SynthesisInput(TypedDict, total=False):
    mode: SynthesisMode
    title: str
    question: str
    audience: str
    desiredDirections: Literal[2, 3]
    sourceIds: list[str]


class RevisionInput(TypedDict, total=False):
    sectionId: str
    body: str
    reason: str
    actor: str


@dataclass
class SynthKitClient:
    base_url: str
    timeout: float = 30.0

    def health(self) -> JsonDict:
        return cast(JsonDict, self._get("/v1/health"))

    def version(self) -> JsonDict:
        return cast(JsonDict, self._get("/v1/version"))

    def capabilities(self) -> JsonDict:
        return cast(JsonDict, self._get("/v1/capabilities"))

    def list_projects(self) -> list[JsonDict]:
        return cast(list[JsonDict], self._get("/v1/projects"))

    def create_project(
        self,
        name: str | ProjectInput,
        description: str | None = None,
        default_mode: SynthesisMode | None = None,
    ) -> JsonDict:
        body: ProjectInput
        if isinstance(name, str):
            body = {"name": name}
            if description:
                body["description"] = description
            if default_mode:
                body["defaultMode"] = default_mode
        else:
            body = name
        return cast(JsonDict, self._post("/v1/projects", body))

    def get_project(self, project_id: str) -> JsonDict:
        return cast(JsonDict, self._get(f"/v1/projects/{self._encode(project_id)}"))

    def ingest_text(
        self,
        project_id: str,
        text: str | TextIngestInput,
        title: str | None = None,
        provenance: Mapping[str, Any] | None = None,
    ) -> JsonDict:
        body: TextIngestInput
        if isinstance(text, str):
            body = {"text": text}
            if title:
                body["title"] = title
            if provenance:
                body["provenance"] = dict(provenance)
        else:
            body = text
        return cast(JsonDict, self._post(f"/v1/projects/{self._encode(project_id)}/ingest/text", body))

    def ingest_markdown(
        self,
        project_id: str,
        markdown: str | TextIngestInput,
        title: str | None = None,
    ) -> JsonDict:
        body: TextIngestInput
        if isinstance(markdown, str):
            body = {"markdown": markdown}
            if title:
                body["title"] = title
        else:
            body = markdown
        return cast(JsonDict, self._post(f"/v1/projects/{self._encode(project_id)}/ingest/markdown", body))

    def ingest_url(self, project_id: str, url: str | UrlIngestInput, title: str | None = None) -> JsonDict:
        body: UrlIngestInput = {"url": url} if isinstance(url, str) else url
        if isinstance(url, str) and title:
            body["title"] = title
        return cast(JsonDict, self._post(f"/v1/projects/{self._encode(project_id)}/ingest/url", body))

    def ingest_pdf(self, project_id: str, file_path: str | FileIngestInput, title: str | None = None) -> JsonDict:
        body: FileIngestInput = {"filePath": file_path} if isinstance(file_path, str) else file_path
        if isinstance(file_path, str) and title:
            body["title"] = title
        return cast(JsonDict, self._post(f"/v1/projects/{self._encode(project_id)}/ingest/pdf", body))

    def ingest_image(self, project_id: str, file_path: str | FileIngestInput, title: str | None = None) -> JsonDict:
        body: FileIngestInput = {"filePath": file_path} if isinstance(file_path, str) else file_path
        if isinstance(file_path, str) and title:
            body["title"] = title
        return cast(JsonDict, self._post(f"/v1/projects/{self._encode(project_id)}/ingest/image", body))

    def ingest_transcript(
        self,
        project_id: str,
        transcript: str | TranscriptIngestInput,
        title: str | None = None,
    ) -> JsonDict:
        body: TranscriptIngestInput = {"transcript": transcript} if isinstance(transcript, str) else transcript
        if isinstance(transcript, str) and title:
            body["title"] = title
        return cast(JsonDict, self._post(f"/v1/projects/{self._encode(project_id)}/ingest/transcript", body))

    def synthesize(
        self,
        project_id: str,
        mode: SynthesisMode | SynthesisInput,
        title: str | None = None,
        *,
        question: str | None = None,
        audience: str | None = None,
        desired_directions: Literal[2, 3] | None = None,
        source_ids: list[str] | None = None,
    ) -> JsonDict:
        body: SynthesisInput
        if isinstance(mode, str):
            body = {"mode": mode, "title": title or "Untitled synthesis"}
            if question:
                body["question"] = question
            if audience:
                body["audience"] = audience
            if desired_directions:
                body["desiredDirections"] = desired_directions
            if source_ids:
                body["sourceIds"] = source_ids
        else:
            body = mode
        return cast(JsonDict, self._post(f"/v1/projects/{self._encode(project_id)}/synthesize", body))

    def get_draft(self, synthesis_id: str) -> JsonDict:
        return cast(JsonDict, self._get(f"/v1/syntheses/{self._encode(synthesis_id)}/draft"))

    def get_citations(self, synthesis_id: str) -> list[JsonDict]:
        return cast(list[JsonDict], self._get(f"/v1/syntheses/{self._encode(synthesis_id)}/citations"))

    def get_contradictions(self, synthesis_id: str) -> list[JsonDict]:
        return cast(list[JsonDict], self._get(f"/v1/syntheses/{self._encode(synthesis_id)}/contradictions"))

    def get_revisions(self, synthesis_id: str) -> list[JsonDict]:
        return cast(list[JsonDict], self._get(f"/v1/syntheses/{self._encode(synthesis_id)}/revisions"))

    def revise_section(
        self,
        synthesis_id: str,
        section_id: str | RevisionInput,
        body: str | None = None,
        reason: str | None = None,
        actor: str | None = None,
    ) -> JsonDict:
        payload: RevisionInput
        if isinstance(section_id, str):
            payload = {"sectionId": section_id, "body": body or "", "reason": reason or ""}
            if actor:
                payload["actor"] = actor
        else:
            payload = section_id
        return cast(JsonDict, self._post(f"/v1/syntheses/{self._encode(synthesis_id)}/revisions", payload))

    def export_markdown(self, synthesis_id: str) -> JsonDict:
        return cast(JsonDict, self._post(f"/v1/syntheses/{self._encode(synthesis_id)}/export", {"format": "markdown"}))

    def export_json(self, synthesis_id: str) -> JsonDict:
        return cast(JsonDict, self._post(f"/v1/syntheses/{self._encode(synthesis_id)}/export", {"format": "json"}))

    def get_stages(self, synthesis_id: str) -> JsonDict:
        return cast(JsonDict, self._get(f"/v1/syntheses/{self._encode(synthesis_id)}/stages"))

    def _get(self, path: str) -> Any:
        return self._request("GET", path)

    def _post(self, path: str, body: Mapping[str, Any]) -> Any:
        return self._request("POST", path, body)

    def _request(self, method: str, path: str, body: Mapping[str, Any] | None = None) -> Any:
        data = None if body is None else json.dumps(dict(body)).encode("utf-8")
        req = request.Request(
            self.base_url.rstrip("/") + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        try:
            with request.urlopen(req, timeout=self.timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
                if not isinstance(payload, dict) or not payload.get("ok", False):
                    raise SynthKitApiError("Malformed response envelope", details=payload)
                if "data" not in payload:
                    return None
                return payload["data"]
        except error.HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(body_text)
            except json.JSONDecodeError:
                payload = {"raw": body_text}
            message = "HTTP error"
            if isinstance(payload, dict):
                message = payload.get("error", {}).get("message") or payload.get("message") or message
            raise SynthKitApiError(message, status=exc.code, details=payload) from None
        except error.URLError as exc:
            raise SynthKitApiError(f"Connection failed: {exc.reason}", code="connection_error") from None

    @staticmethod
    def _encode(value: str) -> str:
        return parse.quote(value, safe="")
