# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4] - 2026-09-21

### Fixed

- The **Preset** dropdown on the Create operation now lists every preset. The
  request to `/presets.json` omitted `preset_type`, so the API returned only a
  subset and presets were missing from the list.

### Changed

- Both nodes can now be found by what they do, not only by name. The n8n nodes
  panel searches just `displayName` and the codex `alias` field, so aliases
  (audio, podcast, loudness, transcription, mastering, …) were added to each.
- **Auphonic Trigger** has a codex file for the first time, giving it categories
  and links to the README and credential documentation in its detail view.
- The trigger description now names the medium — "an Auphonic audio production"
  — instead of assuming the reader knows what a production is.
- Rewrote the npm package description and expanded `keywords`, which feed the
  community-nodes install panel and npm search.

## [0.1.3] - 2026-09-14

### Fixed

- Corrected the codex node identifier and categories so the node is filed under
  the right category in the nodes panel.

## [0.1.2] - 2026-08-31

### Changed

- Send a `User-Agent` header identifying the node and its version on every
  Auphonic API request.

## [0.1.1] - 2026-07-27

### Added

- **Simplify** option on the Auphonic node's output, reducing a production to
  the most-used fields with nested values flattened.

### Changed

- Renamed operation actions and tidied parameter naming to follow the n8n UX
  guidelines.
- Releases are staged to npm via Trusted Publishing (OIDC) instead of a
  long-lived token, and are held for maintainer approval before going public.

## [0.1.0] - 2026-07-27

Initial public release.

### Added

- **Auphonic** node with three operations on the Production resource: Create
  (submit an audio file or URL for processing), Get Production Details, and
  Download Output File. Usable as an AI agent tool.
- **Auphonic Trigger** node that starts a workflow when a production finishes
  processing. It registers a webhook on the selected preset and enriches the
  webhook payload with the full production.
- **Auphonic API** credential, authenticating with an API key and including a
  connection test.
- Published to npm with a SLSA provenance attestation.

[0.1.4]: https://github.com/auphonic/n8n-nodes-auphonic/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/auphonic/n8n-nodes-auphonic/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/auphonic/n8n-nodes-auphonic/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/auphonic/n8n-nodes-auphonic/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/auphonic/n8n-nodes-auphonic/releases/tag/v0.1.0
