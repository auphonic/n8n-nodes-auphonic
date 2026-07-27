import type {
  IAuthenticateGeneric,
  Icon,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from "n8n-workflow";
import { AUPHONIC_BASE_URL } from "../nodes/Auphonic/constants";

export class AuphonicApi implements ICredentialType {
  name = "auphonicApi";

  displayName = "Auphonic API";

  icon: Icon = "file:auphonic.svg" as Icon;

  documentationUrl = "https://auphonic.com/api/docs/";

  properties: INodeProperties[] = [
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      required: true,
      default: "",
      description:
        "Your Auphonic API key. Find it at auphonic.com/user/account.",
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: "generic",
    properties: {
      headers: {
        Authorization: "=Bearer {{$credentials.apiKey}}",
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      url: `${AUPHONIC_BASE_URL}/presets.json`,
    },
  };
}
