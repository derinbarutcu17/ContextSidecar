# SynthKit Python SDK

Python client for the SynthKit local HTTP API.

This is not a separate engine. It is a practical client for Python automation, notebooks, and agent workflows that need to create projects, ingest sources, run synthesis, inspect evidence, and export artifacts.

## Install

From the repo:

```bash
pip install -e packages/sdk-py
```

Or run the smoke test:

```bash
python3 -m unittest discover -s packages/sdk-py/tests
```

## End-to-end example

```python
from synthkit_sdk import SynthKitClient

client = SynthKitClient("http://127.0.0.1:8787")

project = client.create_project("Research", description="Q1 market notes")
client.ingest_text(project["id"], "Messy note dump", title="Notes")
client.ingest_markdown(project["id"], "# Heading\n\nSome context", title="Markdown")
client.ingest_url(project["id"], "https://example.com/article", title="Source page")

bundle = client.synthesize(project["id"], "brief", "Research brief")
draft = client.get_draft(bundle["draft"]["id"])
citations = client.get_citations(bundle["draft"]["id"])
contradictions = client.get_contradictions(bundle["draft"]["id"])
revisions = client.get_revisions(bundle["draft"]["id"])

print(draft["id"])
print(len(citations), len(contradictions), len(revisions))
print(client.export_markdown(bundle["draft"]["id"])["format"])
print(client.export_json(bundle["draft"]["id"])["format"])
```

## Methods

- `health()`
- `version()`
- `capabilities()`
- `list_projects()`
- `create_project(...)`
- `get_project(project_id)`
- `ingest_text(...)`
- `ingest_markdown(...)`
- `ingest_url(...)`
- `ingest_pdf(...)`
- `ingest_image(...)`
- `ingest_transcript(...)`
- `synthesize(...)`
- `get_draft(synthesis_id)`
- `get_citations(synthesis_id)`
- `get_contradictions(synthesis_id)`
- `get_revisions(synthesis_id)`
- `revise_section(...)`
- `export_markdown(synthesis_id)`
- `export_json(synthesis_id)`
- `get_stages(synthesis_id)`

## Limitations

- HTTP client only
- no embedded engine
- no MCP transport
- no cloud assumptions
- parity with the TypeScript SDK is intentionally not claimed
