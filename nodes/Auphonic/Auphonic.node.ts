import { AUPHONIC_BASE_URL } from "./constants";
import {
  NodeApiError,
  NodeConnectionTypes,
  NodeOperationError,
  type IDataObject,
  type JsonObject,
  type IExecuteFunctions,
  type ILoadOptionsFunctions,
  type INodeExecutionData,
  type INodePropertyOptions,
  type INodeType,
  type INodeTypeDescription,
} from "n8n-workflow";

interface AuphonicPreset {
  uuid: string;
  preset_name: string;
}

interface AuphonicResponse {
  status_code: number;
  error_message: string;
  data: IDataObject;
}

/**
 * Reduce a full production object (~40 fields) to the most-used ones, with
 * nested values flattened. Keeps every field the output-routing flow relies on
 * (each output file's download_url, filename, format, ending).
 */
function simplifyProduction(production: IDataObject): IDataObject {
  const metadata = (production.metadata as IDataObject) ?? {};
  const outputFiles = ((production.output_files as IDataObject[]) ?? []).map(
    (file) => ({
      filename: file.filename,
      format: file.format,
      ending: file.ending,
      size: file.size_string,
      download_url: file.download_url,
    }),
  );

  const simplified: IDataObject = {
    uuid: production.uuid,
    status: production.status_string,
    title: metadata.title,
    length: production.length_timestring,
    format: production.format,
    has_video: production.has_video,
    output_files: outputFiles,
    status_page: production.status_page,
  };
  if (production.warning_message) {
    simplified.warning = production.warning_message;
  }
  return simplified;
}

export class Auphonic implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Auphonic",
    name: "auphonic",
    icon: {
      light: "file:assets/auphonic.svg",
      dark: "file:assets/auphonic.dark.svg",
    },
    group: ["transform"],
    version: 1,
    subtitle:
      '={{ $parameter["operation"] === "create" ? "Create Production" : $parameter["operation"] === "get" ? "Get Production Details" : "Download Output File" }}',
    description:
      "Create Auphonic productions, fetch production details, and download output files",
    defaults: {
      name: "Auphonic",
    },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: "auphonicApi", required: true }],
    properties: [
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        noDataExpression: true,
        options: [{ name: "Production", value: "production" }],
        default: "production",
      },
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        displayOptions: { show: { resource: ["production"] } },
        options: [
          {
            name: "Create",
            value: "create",
            action: "Create production",
            description: "Submit an audio file to Auphonic for processing",
          },
          {
            name: "Download Output File",
            value: "download",
            action: "Download output file",
            description:
              "Download an output file's binary using its download URL",
          },
          {
            name: "Get",
            value: "get",
            action: "Get production details",
            description: "Retrieve details of a production by UUID",
          },
        ],
        default: "create",
      },
      {
        displayName: "Production UUID",
        name: "productionUuid",
        type: "string",
        default: "={{ $json.uuid }}",
        required: true,
        displayOptions: { show: { operation: ["get"] } },
        description:
          "UUID of the production to retrieve. Defaults to the 'uuid' field of the incoming item (e.g. from the Auphonic Trigger).",
      },
      {
        displayName: "Download URL",
        name: "downloadUrl",
        type: "string",
        default: "={{ $json.download_url }}",
        required: true,
        displayOptions: { show: { operation: ["download"] } },
        description:
          "Authenticated Auphonic download URL of the output file. Defaults to the 'download_url' field of the incoming item (e.g. after a Split Out on 'output_files').",
      },
      {
        displayName: "Put Output In Field",
        name: "putOutputInField",
        type: "string",
        default: "data",
        required: true,
        displayOptions: { show: { operation: ["download"] } },
        description:
          "Name of the binary property to write the downloaded file to",
      },
      {
        displayName: "File Name",
        name: "fileName",
        type: "string",
        default: "",
        displayOptions: { show: { operation: ["download"] } },
        description:
          "Optional file name for the downloaded binary. If left empty, it is derived from the last path segment of the download URL.",
      },
      {
        displayName: "Preset Name or ID",
        name: "preset",
        type: "options",
        typeOptions: {
          loadOptionsMethod: "getPresets",
        },
        default: "",
        required: true,
        displayOptions: { show: { operation: ["create"] } },
        description:
          'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
      },
      {
        displayName: "Input File",
        name: "binaryPropertyName",
        type: "string",
        default: "data",
        required: true,
        displayOptions: { show: { operation: ["create"] } },
        description:
          "A URL to an audio file, or the name of a binary property containing the audio file to process",
      },
      {
        displayName: "Title",
        name: "title",
        type: "string",
        default: "",
        displayOptions: { show: { operation: ["create"] } },
        description: "A title for this production",
      },

      {
        displayName: "Output File Basename",
        name: "output_basename",
        type: "string",
        default: "",
        displayOptions: { show: { operation: ["create"] } },
        description: "Base filename for output files",
      },
      {
        displayName: "Start Processing",
        name: "action",
        type: "boolean",
        default: true,
        displayOptions: { show: { operation: ["create"] } },
        description:
          "Whether to start audio processing immediately. If false, the production is saved as a draft.",
      },
      {
        displayName: "Additional Fields",
        name: "additionalFields",
        type: "collection",
        placeholder: "Add Field",
        default: {},
        displayOptions: { show: { operation: ["create"] } },
        options: [
          {
            displayName: "Chapter Marks",
            name: "chapters",
            type: "string",
            typeOptions: {
              rows: 4,
            },
            default: "",
            placeholder: "e.g. 00:00:00 Intro\n00:05:30 Interview\n00:25:00 Outro",
            description: "Chapter marks for this production",
          },
          {
            displayName: "Cover Image",
            name: "image",
            type: "string",
            default: "",
            description:
              "A URL to a cover image, or the name of a binary property containing an image file",
          },
          {
            displayName: "Subtitle",
            name: "subtitle",
            type: "string",
            default: "",
            description: "Subtitle for this production",
          },
          {
            displayName: "Summary / Description",
            name: "summary",
            type: "string",
            typeOptions: {
              rows: 4,
            },
            default: "",
            description: "Summary or description for this production",
          },
          {
            displayName: "Tags",
            name: "tags",
            type: "string",
            default: "",
            description: "Comma-separated tags for this production",
          },
          {
            displayName: "Webhook URL",
            name: "webhook",
            type: "string",
            default: "",
            description: "URL to call when processing is complete",
          },
        ],
      },
      {
        displayName: "Simplify",
        name: "simplify",
        type: "boolean",
        default: true,
        displayOptions: { show: { operation: ["create", "get"] } },
        description:
          "Whether to return a simplified subset of the production (status, title, output files, etc.) instead of the full raw API response",
      },
    ],
  };

  methods = {
    loadOptions: {
      async getPresets(
        this: ILoadOptionsFunctions,
      ): Promise<INodePropertyOptions[]> {
        const response = (await this.helpers.httpRequestWithAuthentication.call(
          this,
          "auphonicApi",
          {
            method: "GET",
            url: `${AUPHONIC_BASE_URL}/presets.json`,
            qs: { minimal_data: 1, limit: 100 },
            json: true,
          },
        )) as AuphonicResponse;

        if (response.status_code !== 200) {
          throw new NodeApiError(
            this.getNode(),
            {
              message: `Could not load presets from Auphonic (HTTP ${response.status_code}): ${response.error_message}`,
            },
            {
              description:
                "Check that your Auphonic API credentials are valid and can access presets.",
            },
          );
        }

        return (response.data as unknown as AuphonicPreset[]).map((preset) => ({
          name: preset.preset_name,
          value: preset.uuid,
        }));
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const operation = this.getNodeParameter("operation", 0) as string;
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        if (operation === "create") {
          const preset = this.getNodeParameter("preset", i) as string;
          const title = this.getNodeParameter("title", i, "") as string;
          const outputBasename = this.getNodeParameter(
            "output_basename",
            i,
            "",
          ) as string;
          const binaryPropertyName = this.getNodeParameter(
            "binaryPropertyName",
            i,
          ) as string;
          const additionalFields = this.getNodeParameter("additionalFields", i);
          const action = this.getNodeParameter("action", i) as boolean;
          const isInputUrl =
            binaryPropertyName.startsWith("http://") ||
            binaryPropertyName.startsWith("https://");
          const binaryData = isInputUrl
            ? null
            : this.helpers.assertBinaryData(i, binaryPropertyName);
          const binaryDataBuffer =
            isInputUrl || !binaryData
              ? null
              : await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

          // Manually construct multipart/form-data without external dependencies
          const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
          const parts: Buffer[] = [];

          // Helper function to add form field
          const addField = (name: string, value: string) => {
            parts.push(
              Buffer.from(
                `--${boundary}\r\n` +
                  `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
                  `${value}\r\n`,
              ),
            );
          };

          // Add form fields
          addField("preset", preset);
          if (title) {
            addField("title", title);
          }
          if (outputBasename) {
            addField("output_basename", outputBasename);
          }
          if (action) {
            addField("action", "start");
          }

          // Add additional fields
          for (const [key, value] of Object.entries(additionalFields)) {
            if (key === "image" || value === undefined || value === "")
              continue;
            addField(key, String(value));
          }

          // Add cover image (URL or binary file)
          const image = additionalFields.image as string | undefined;
          if (image) {
            if (image.startsWith("http://") || image.startsWith("https://")) {
              addField("image", image);
            } else {
              const imageBinaryData = this.helpers.assertBinaryData(i, image);
              const imageBinaryBuffer = await this.helpers.getBinaryDataBuffer(
                i,
                image,
              );
              const imageFilename = imageBinaryData.fileName ?? "cover.jpg";
              const imageContentType = imageBinaryData.mimeType ?? "image/jpeg";
              parts.push(
                Buffer.from(
                  `--${boundary}\r\n` +
                    `Content-Disposition: form-data; name="image"; filename="${imageFilename}"\r\n` +
                    `Content-Type: ${imageContentType}\r\n\r\n`,
                ),
              );
              parts.push(imageBinaryBuffer);
              parts.push(Buffer.from(`\r\n`));
            }
          }

          // Add input file (URL or binary)
          if (isInputUrl) {
            addField("input_file", binaryPropertyName);
          } else {
            const filename = binaryData!.fileName ?? "audio.mp3";
            const contentType = binaryData!.mimeType ?? "audio/mpeg";
            parts.push(
              Buffer.from(
                `--${boundary}\r\n` +
                  `Content-Disposition: form-data; name="input_file"; filename="${filename}"\r\n` +
                  `Content-Type: ${contentType}\r\n\r\n`,
              ),
            );
            parts.push(binaryDataBuffer!);
          }
          parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

          const body = Buffer.concat(parts);

          const rawResponse =
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              "auphonicApi",
              {
                method: "POST",
                url: `${AUPHONIC_BASE_URL}/simple/productions.json`,
                body,
                headers: {
                  "Content-Type": `multipart/form-data; boundary=${boundary}`,
                },
              },
            );

          const response: AuphonicResponse =
            typeof rawResponse === "string"
              ? (JSON.parse(rawResponse) as AuphonicResponse)
              : (rawResponse as AuphonicResponse);

          if (response.status_code !== 200) {
            throw new NodeOperationError(
              this.getNode(),
              `Auphonic could not create the production (HTTP ${response.status_code}): ${response.error_message}`,
              {
                itemIndex: i,
                description:
                  "Check the selected preset and input file, then run the node again.",
              },
            );
          }

          const simplify = this.getNodeParameter(
            "simplify",
            i,
            true,
          ) as boolean;
          returnData.push({
            json: simplify ? simplifyProduction(response.data) : response.data,
            pairedItem: { item: i },
          });
        } else if (operation === "get") {
          const uuid = this.getNodeParameter("productionUuid", i) as string;
          const rawResponse =
            (await this.helpers.httpRequestWithAuthentication.call(
              this,
              "auphonicApi",
              {
                method: "GET",
                url: `${AUPHONIC_BASE_URL}/production/${uuid}.json`,
                json: true,
              },
            )) as AuphonicResponse;

          if (rawResponse.status_code !== 200) {
            throw new NodeOperationError(
              this.getNode(),
              `Auphonic could not fetch the production (HTTP ${rawResponse.status_code}): ${rawResponse.error_message}`,
              {
                itemIndex: i,
                description:
                  "Verify the production UUID exists and your credentials have access to it.",
              },
            );
          }

          const simplify = this.getNodeParameter(
            "simplify",
            i,
            true,
          ) as boolean;
          returnData.push({
            json: simplify
              ? simplifyProduction(rawResponse.data)
              : rawResponse.data,
            pairedItem: { item: i },
          });
        } else if (operation === "download") {
          const downloadUrl = this.getNodeParameter(
            "downloadUrl",
            i,
          ) as string;
          const putOutputInField = this.getNodeParameter(
            "putOutputInField",
            i,
          ) as string;
          const fileName = this.getNodeParameter("fileName", i, "") as string;

          let responseBuffer: Buffer;
          try {
            responseBuffer =
              (await this.helpers.httpRequestWithAuthentication.call(
                this,
                "auphonicApi",
                {
                  method: "GET",
                  url: downloadUrl,
                  encoding: "arraybuffer",
                  returnFullResponse: false,
                  // Auphonic download URLs 302-redirect to storage (S3) with a
                  // presigned URL. Forwarding the Authorization header to that
                  // cross-origin target makes S3 reject the request with 400
                  // (two auth mechanisms). Don't send credentials on redirect.
                  sendCredentialsOnCrossOriginRedirect: false,
                },
              )) as Buffer;
          } catch (error) {
            throw new NodeOperationError(
              this.getNode(),
              `Auphonic could not download the output file: ${(error as Error).message}`,
              {
                itemIndex: i,
                description:
                  "Check that the download URL is current — Auphonic links can expire. Re-fetch the production to get a fresh 'download_url'.",
              },
            );
          }

          const resolvedName =
            fileName || downloadUrl.split("/").pop() || "download";
          const binaryData = await this.helpers.prepareBinaryData(
            Buffer.from(responseBuffer),
            resolvedName,
          );

          returnData.push({
            json: items[i].json,
            binary: { [putOutputInField]: binaryData },
            pairedItem: { item: i },
          });
        }
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: { error: (error as Error).message },
            pairedItem: { item: i },
          });
          continue;
        }
        // Re-wrap as NodeApiError (an existing NodeApiError is returned as-is),
        // carrying over our custom message and description so the friendly text
        // from the operation branches above is not lost.
        throw new NodeApiError(this.getNode(), error as JsonObject, {
          itemIndex: i,
          message: (error as Error).message,
          description: (error as { description?: string }).description,
        });
      }
    }

    return [returnData];
  }
}
