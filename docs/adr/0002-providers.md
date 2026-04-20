# ADR 0002: Provider adapters instead of hard-coding one model API

## Decision

Support mock, OpenAI, Anthropic, and Ollama-style adapters behind a common provider interface.

## Rationale

- the repo must work with no API key
- model backends change faster than the core contract
- agent runtimes need a stable local behavior even when providers are absent

## Consequences

- some advanced provider features will be shallow in v1
- adapter fallbacks must be explicit and honest

