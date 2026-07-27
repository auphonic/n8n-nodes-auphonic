import {
  NodeConnectionTypes,
  type IDataObject,
  type IHookFunctions,
  type IWebhookFunctions,
  type INodeType,
  type INodeTypeDescription,
  type IWebhookResponseData,
  type ILoadOptionsFunctions,
  type INodePropertyOptions,
  NodeApiError,
} from "n8n-workflow";
import { AUPHONIC_BASE_URL } from "./constants";

interface AuphonicPreset {
  uuid: string;
  preset_name: string;
}

interface AuphonicResponse {
  status_code: number;
  error_message: string;
  data: IDataObject;
}

interface AuphonicWebhookResponse {
  status_code: number;
  error_message: string;
  webhook: string[] | null;
}

// Trigger nodes are never usable as AI tools (n8n only exposes callable,
// non-trigger nodes as tools), and the n8n type allows no `false` value for
// usableAsTool — so we omit the property and silence the presence-check rule.
// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class AuphonicTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Auphonic Trigger",
    name: "auphonicTrigger",
    icon: {
      light: "file:assets/auphonic.svg",
      dark: "file:assets/auphonic.dark.svg",
    },
    group: ["trigger"],
    version: 1,
    subtitle: "On production finished",
    description:
      "Starts the workflow when Auphonic finishes processing a production",
    defaults: {
      name: "Auphonic Trigger",
    },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: "auphonicApi", required: true }],
    webhooks: [
      {
        name: "default",
        httpMethod: "POST",
        responseMode: "onReceived",
        path: "webhook",
      },
    ],
    properties: [
      {
        displayName: "Preset Name or ID",
        name: "preset",
        type: "options",
        typeOptions: {
          loadOptionsMethod: "getPresets",
        },
        default: "",
        required: true,
        description:
          'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
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
            json: true,
          },
        )) as AuphonicResponse;

        if (response.status_code !== 200) {
          throw new NodeApiError(this.getNode(), {
            message: `Failed to load presets: ${response.error_message}`,
            httpCode: response.status_code,
          });
        }

        return (response.data as unknown as AuphonicPreset[]).map((preset) => ({
          name: preset.preset_name,
          value: preset.uuid,
        }));
      },
    },
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const uuid = this.getNodeParameter("preset") as string;
        const webhookUrl = this.getNodeWebhookUrl("default");
        if (!webhookUrl) return false;

        const response = (await this.helpers.httpRequestWithAuthentication.call(
          this,
          "auphonicApi",
          {
            method: "GET",
            url: `${AUPHONIC_BASE_URL}/preset/${uuid}/webhook.json`,
            json: true,
          },
        )) as AuphonicWebhookResponse;

        if (response.status_code !== 200) return false;
        return (response.webhook ?? []).includes(webhookUrl);
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const uuid = this.getNodeParameter("preset") as string;
        const webhookUrl = this.getNodeWebhookUrl("default");
        if (!webhookUrl) return false;

        const response = (await this.helpers.httpRequestWithAuthentication.call(
          this,
          "auphonicApi",
          {
            method: "POST",
            url: `${AUPHONIC_BASE_URL}/preset/${uuid}/webhook.json`,
            json: true,
            body: { webhook: webhookUrl },
          },
        )) as AuphonicWebhookResponse;

        return response.status_code === 200;
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const uuid = this.getNodeParameter("preset") as string;
        const webhookUrl = this.getNodeWebhookUrl("default");
        if (!webhookUrl) return false;

        const response = (await this.helpers.httpRequestWithAuthentication.call(
          this,
          "auphonicApi",
          {
            method: "DELETE",
            url: `${AUPHONIC_BASE_URL}/preset/${uuid}/webhook.json`,
            json: true,
            body: { webhook: webhookUrl },
          },
        )) as AuphonicWebhookResponse;

        return response.status_code === 200;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const body = this.getBodyData() as IDataObject;
    const uuid = body.uuid as string | undefined;

    // Auphonic's webhook payload is only { uuid, status, status_string }.
    // If there's no uuid we can't enrich — pass the raw body through.
    if (!uuid) {
      return { workflowData: [[{ json: body }]] };
    }

    const response = (await this.helpers.httpRequestWithAuthentication.call(
      this,
      "auphonicApi",
      {
        method: "GET",
        url: `${AUPHONIC_BASE_URL}/production/${uuid}.json`,
        json: true,
      },
    )) as AuphonicResponse;

    if (response.status_code !== 200) {
      throw new NodeApiError(this.getNode(), {
        message: `Failed to fetch production ${uuid}: ${response.error_message}`,
        httpCode: String(response.status_code),
      });
    }

    return { workflowData: [[{ json: response.data }]] };
  }
}
