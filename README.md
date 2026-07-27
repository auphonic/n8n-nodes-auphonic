# n8n-nodes-auphonic

This is an n8n community node. It lets you use [Auphonic](https://auphonic.com/) in your n8n workflows.

Auphonic is an automatic audio post-production web service for podcasts, broadcasters, and audiobooks. It handles loudness normalization, noise and hum reduction, filtering, and encoding, and can publish the result to a range of external services.

This package provides two nodes:

- **Auphonic** — an action node with three operations: **Create Production** (submit an audio file for processing), **Get Production Details** (fetch a production's details), and **Download Output File** (download a finished output file as binary).
- **Auphonic Trigger** — start a workflow when a production finishes processing. It emits the full, finished production (including its list of output files) so you can route and download individual results downstream.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)  
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

In n8n, go to **Settings > Community Nodes**, select **Install**, and enter `n8n-nodes-auphonic`.

## Operations

### Auphonic

The **Auphonic** node has three operations, selected with the **Operation** dropdown (resource: **Production**).

#### Create Production

Creates a new production from a preset and an input audio file, and optionally starts processing immediately.

- **Preset** — the Auphonic preset to base the production on. Choose from the list of your presets, or provide a preset UUID via an expression.
- **Input File** — the audio to process. Either a public URL to an audio file, or the name of a binary property on the incoming item that contains the audio file.
- **Title** — an optional title for the production.
- **Output File Basename** — an optional base filename for the output files.
- **Start Processing** — when enabled (default), Auphonic starts processing immediately. When disabled, the production is created as a draft that you can start later.
- **Additional Fields**:
  - **Chapter Marks** — chapter marks for the production (one per line).
  - **Cover Image** — a public URL to a cover image, or the name of a binary property containing an image file.
  - **Subtitle** — a subtitle for the production.
  - **Summary / Description** — a summary or description for the production.
  - **Tags** — comma-separated tags.
  - **Webhook URL** — a URL that Auphonic calls when processing is complete.
- **Simplify** — when enabled (the default), returns a reduced set of the most useful production fields instead of the full raw API response.

Returns the created production. With **Simplify** on (the default) this is a compact object — `uuid`, `status`, `title`, `length`, `format`, `has_video`, `output_files`, `status_page`, and `warning` (only when present). With it off, the full raw production object from the Auphonic API.

#### Get Production Details

Fetches the full details of an existing production by its UUID.

- **Production UUID** — the production to retrieve. Defaults to `={{ $json.uuid }}`, so it reads the `uuid` from the incoming item (for example, the output of the Auphonic Trigger).
- **Simplify** — when enabled (the default), returns a reduced set of the most useful production fields instead of the full raw API response.

Returns the production. With **Simplify** on (the default) it is the compact object described under [Create Production](#create-production) above. With it off, the full raw production object, including its `output_files` array, `status`, `metadata`, `chapters`, and more.

#### Download Output File

Downloads a single output file as binary, using your Auphonic credential to authenticate the request. Auphonic download URLs redirect to storage, so this operation handles that redirect for you (without leaking your API key to the storage host).

- **Download URL** — the authenticated download URL of the output file. Defaults to `={{ $json.download_url }}`, which matches one item per file after a **Split Out** on `output_files` (see [Usage](#usage)).
- **Put Output In Field** — the name of the binary property to write the file to. Defaults to `data`.
- **File Name** — optional. If left empty, the file name is derived from the last path segment of the download URL.

Returns the incoming item with the downloaded file attached as binary under the chosen property.

### Auphonic Trigger

Starts a workflow when a production finishes processing.

- **Preset** — the preset to watch. When the workflow is active, the node registers a webhook on this preset. Any production created from the preset then triggers the workflow once it finishes processing. Please note the production must be created after the workflow is active and the webhook has been attached to the preset.

Auphonic's completion webhook only sends the production's `uuid` and status. The trigger uses that to fetch the full production from the API, and emits **one item containing the complete production object** — including the `output_files` array, `status`, `metadata`, and `chapters` — so downstream nodes can route and download individual outputs without an extra fetch step. It fires on both successful (`Done`) and failed (`Error`) productions; branch on the `status` / `status_string` field if you need to handle errors separately.

## Credentials

To use these nodes you need an Auphonic account and an Auphonic API key.

1. Sign up or log in at [auphonic.com](https://auphonic.com/).
2. Create an API key on your [account page](https://auphonic.com/user/account).
3. In n8n, create new **Auphonic API** credentials and paste in the API key.

The key is sent as a bearer token on every request. For more detail, see the [Auphonic authentication documentation](https://auphonic.com/help/api/authentication.html).

## Compatibility

Requires n8n with node API version 1 (`n8nNodesApiVersion: 1`). Tested against n8n 2.30.6.

No known incompatibilities. If you find one, please open an issue.

## Usage

### Create and process a production

1. Add a node that produces an audio file — for example a **Read/Write Files from Disk** node, an **HTTP Request** downloading audio, or any node that outputs binary data.
2. Add the **Auphonic** node.
3. Select the **Preset** to use.
4. Set **Input File** to either the binary property name holding the audio (for example `data`) or a public URL to an audio file.
5. Optionally set a **Title**, **Output File Basename**, and any **Additional Fields**.
6. Leave **Start Processing** enabled to begin immediately, or disable it to create a draft.

### Trigger a workflow when a production finishes

1. Add the **Auphonic Trigger** node as the workflow's trigger.
2. Select the **Preset** to watch.
3. Activate the workflow. From now on, every production created from that preset triggers the workflow when it finishes processing.

The trigger emits the full production object, so downstream nodes have everything they need.

### Route and download output files

A finished production usually has several output files (for example an MP3, a video, and a transcript). Because the number and type of outputs is only known at runtime, routing happens on the data rather than on fixed node outputs:

1. Start with the **Auphonic Trigger** (or a **Get Production Details** operation) so you have the production object, including its `output_files` array.
2. Add a core **Split Out** node and set _Fields To Split Out_ to `output_files`. This produces **one item per output file**, each with `download_url`, `filename`, `format`, and `ending`. (This works whether **Simplify** is on or off — the simplified `output_files` keeps these fields, and the Trigger always emits them.)
3. Add a core **Switch** node and branch on the file type — for example `={{ $json.format }}` or `={{ $json.ending }}` (`mp3`, `wav`, `mp4`, …), or the production-level `has_video` flag.
4. On each branch that needs the bytes, add the **Auphonic → Download Output File** operation. Its **Download URL** field already defaults to `={{ $json.download_url }}`, so it downloads the current file with no extra configuration.
5. Send the downloaded binary to its destination (Google Drive, S3, YouTube, an email, and so on).

Because the download only runs on branches you wire up, output files you don't route anywhere are never downloaded into n8n — useful when outputs are large.

A common end-to-end pattern is to combine everything: use the **Create Production** operation to submit audio, and a separate active workflow with the **Auphonic Trigger** to react when each production completes — splitting, routing, and downloading its outputs to the right places.

If you're new to n8n, see [Try it out](https://docs.n8n.io/try-it-out/) in the n8n documentation.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Auphonic website](https://auphonic.com/)
- [Auphonic API documentation](https://auphonic.com/api/docs/)
- [Auphonic authentication documentation](https://auphonic.com/help/api/authentication.html)

## Version history

### 0.1.1

- Added a **Simplify** option (on by default) to **Create Production** and **Get Production Details** that returns a compact subset of the production instead of the full raw API response. The simplified `output_files` keeps the fields the download flow needs.
- Clearer, actionable error messages for preset loading, Create, Get, and Download failures, each with a description explaining how to resolve it.
- UX polish: renamed the operation to **Get**, refined action labels and placeholders, and quoted field names in descriptions.

### 0.1.0

Initial release.

- **Auphonic** node with three operations: **Create Production**, **Get Production Details**, and **Download Output File** (authenticated binary download that follows Auphonic's storage redirect).
- **Auphonic Trigger** node that fires when a production finishes and emits the full production object (including `output_files`), ready to split, route, and download downstream.
