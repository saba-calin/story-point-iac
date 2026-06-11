const mockDynamoSend = jest.fn();
const mockKmsSend = jest.fn();
const mockAxiosGet = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  UpdateCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("@aws-sdk/client-kms", () => ({
  KMSClient: jest.fn().mockImplementation(() => ({ send: mockKmsSend })),
  EncryptCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("axios", () => ({
  default: { get: (...args: any[]) => mockAxiosGet(...args) },
  get: (...args: any[]) => mockAxiosGet(...args)
}));

process.env.USERS_TABLE = "users";
process.env.KMS_KEY_ID = "kms-key-123";

import { handler } from "../lambda/save-jira-token/index";

describe("save-jira-token", () => {
  const makeEvent = (body: object) => ({
    requestContext: {
      authorizer: {
        lambda: { username: "testuser", email: "test@test.com", firstName: "Test", lastName: "User", role: "user" }
      }
    },
    body: JSON.stringify(body)
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when required fields are missing", async () => {
    const result = await handler(makeEvent({ jiraBaseUrl: "https://jira.com" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Invalid request");
  });

  it("returns 200 on successful token save", async () => {
    mockAxiosGet.mockResolvedValueOnce({
      data: [
        { name: "Story Points", id: "customfield_10016" },
        { name: "Sprint", id: "customfield_10020" }
      ]
    });
    mockKmsSend.mockResolvedValueOnce({
      CiphertextBlob: Buffer.from("encrypted-token")
    });
    mockDynamoSend.mockResolvedValueOnce({});

    const result = await handler(makeEvent({
      jiraBaseUrl: "https://jira.example.com",
      jiraEmail: "jira@test.com",
      jiraToken: "token123"
    }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe("Jira token saved successfully");
  });

  it("returns 500 when Jira API call fails", async () => {
    mockAxiosGet.mockRejectedValueOnce(new Error("Jira error"));

    const result = await handler(makeEvent({
      jiraBaseUrl: "https://jira.example.com",
      jiraEmail: "jira@test.com",
      jiraToken: "token123"
    }));
    expect(result.statusCode).toBe(500);
  });

  it("returns 500 when KMS encryption fails", async () => {
    mockAxiosGet.mockResolvedValueOnce({
      data: [{ name: "Story Points", id: "customfield_10016" }]
    });
    mockKmsSend.mockRejectedValueOnce(new Error("KMS error"));

    const result = await handler(makeEvent({
      jiraBaseUrl: "https://jira.example.com",
      jiraEmail: "jira@test.com",
      jiraToken: "token123"
    }));
    expect(result.statusCode).toBe(500);
  });
});
