import {
  generateErrorResponse,
  getCookieValue,
  getSecret,
  ok,
  extractIssueDescription,
  VALID_VOTES,
  VALID_ESTIMATES,
  ALLOWED_IMAGE_TYPES
} from "../lambda/util";

const mockSend = jest.fn();
jest.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: jest.fn(),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => input)
}));

describe("generateErrorResponse", () => {
  it("returns formatted error response with given status and message", () => {
    const result = generateErrorResponse(400, "Bad request");
    expect(result).toEqual({
      statusCode: 400,
      body: JSON.stringify({ message: "Bad request" }),
      headers: { "Content-Type": "application/json" }
    });
  });

  it("returns 500 error response", () => {
    const result = generateErrorResponse(500, "Internal server error");
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe("Internal server error");
  });
});

describe("getCookieValue", () => {
  it("returns null when cookie header is empty", () => {
    expect(getCookieValue("", "sp-access")).toBeNull();
  });

  it("returns null when cookie header is null/undefined", () => {
    expect(getCookieValue(null as any, "sp-access")).toBeNull();
  });

  it("extracts cookie value by name", () => {
    const header = "sp-access=token123; sp-refresh=refresh456";
    expect(getCookieValue(header, "sp-access")).toBe("token123");
    expect(getCookieValue(header, "sp-refresh")).toBe("refresh456");
  });

  it("returns null when cookie name not found", () => {
    const header = "sp-access=token123";
    expect(getCookieValue(header, "sp-refresh")).toBeNull();
  });

  it("handles cookie values with equals signs", () => {
    const header = "sp-access=abc=def=ghi";
    expect(getCookieValue(header, "sp-access")).toBe("abc=def=ghi");
  });
});

describe("getSecret", () => {
  it("returns cached secret when available", async () => {
    const result = await getSecret("cached-secret", "arn:aws:sm:secret", {} as any);
    expect(result).toBe("cached-secret");
  });

  it("fetches secret from secrets manager when not cached", async () => {
    const secretsClient = {
      send: jest.fn().mockResolvedValue({
        SecretString: JSON.stringify({ secret: "fetched-secret" })
      })
    };
    const result = await getSecret(null, "arn:aws:sm:secret", secretsClient as any);
    expect(result).toBe("fetched-secret");
    expect(secretsClient.send).toHaveBeenCalled();
  });
});

describe("ok", () => {
  it("returns status 200", () => {
    expect(ok()).toEqual({ statusCode: 200 });
  });
});

describe("extractIssueDescription", () => {
  it("returns null when description is null", () => {
    expect(extractIssueDescription(null)).toBeNull();
  });

  it("returns null when description has no content", () => {
    expect(extractIssueDescription({})).toBeNull();
    expect(extractIssueDescription({ content: null })).toBeNull();
  });

  it("extracts text from Atlassian document format", () => {
    const description = {
      content: [
        {
          content: [
            { text: "Hello" },
            { text: " world" }
          ]
        },
        {
          content: [
            { text: "Second paragraph" }
          ]
        }
      ]
    };
    expect(extractIssueDescription(description)).toBe("Hello  world Second paragraph");
  });

  it("returns null when all text is empty", () => {
    const description = {
      content: [
        { content: [{ text: "" }] }
      ]
    };
    expect(extractIssueDescription(description)).toBeNull();
  });

  it("handles blocks without content array", () => {
    const description = {
      content: [
        { type: "rule" },
        { content: [{ text: "text" }] }
      ]
    };
    expect(extractIssueDescription(description)).toBe("text");
  });
});

describe("constants", () => {
  it("VALID_VOTES includes fibonacci + question mark", () => {
    expect(VALID_VOTES).toEqual(["1", "2", "3", "5", "8", "13", "21", "?"]);
  });

  it("VALID_ESTIMATES includes fibonacci without question mark", () => {
    expect(VALID_ESTIMATES).toEqual(["1", "2", "3", "5", "8", "13", "21"]);
  });

  it("ALLOWED_IMAGE_TYPES maps content types to extensions", () => {
    expect(ALLOWED_IMAGE_TYPES["image/jpg"]).toBe(".jpg");
    expect(ALLOWED_IMAGE_TYPES["image/jpeg"]).toBe(".jpeg");
    expect(ALLOWED_IMAGE_TYPES["image/png"]).toBe(".png");
    expect(ALLOWED_IMAGE_TYPES["image/gif"]).toBeUndefined();
  });
});
