const mockDynamoSend = jest.fn();
const mockSecretsSend = jest.fn();
const mockOpenAiCreate = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  GetCommand: jest.fn().mockImplementation((input) => input),
  QueryCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: mockSecretsSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("openai", () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockOpenAiCreate } }
  }))
}));

process.env.ROOMS_TABLE = "rooms";
process.env.STORIES_TABLE = "stories";
process.env.OPEN_AI_SECRET_KEY_ARN = "arn:aws:secretsmanager:us-east-1:123:secret:openai";

import { handler } from "../lambda/ai-estimate/index";

describe("ai-estimate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecretsSend.mockResolvedValue({
      SecretString: JSON.stringify({ secret: "openai-key" })
    });
  });

  it("returns 400 when storyName is missing", async () => {
    const event = { body: JSON.stringify({}) };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("The story must have at least a name");
  });

  it("returns 200 with AI estimate", async () => {
    mockOpenAiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{ "estimate": "5" }' } }]
    });

    const event = {
      body: JSON.stringify({ storyName: "Add login page", storyDescription: "Create a login form" })
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.estimate).toBe("5");
  });

  it("returns default estimate when AI returns null content", async () => {
    mockOpenAiCreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }]
    });

    const event = {
      body: JSON.stringify({ storyName: "Some story" })
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).estimate).toBe("?");
  });

  it("returns 500 when OpenAI call fails", async () => {
    mockOpenAiCreate.mockRejectedValueOnce(new Error("OpenAI error"));

    const event = {
      body: JSON.stringify({ storyName: "Add login page" })
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
