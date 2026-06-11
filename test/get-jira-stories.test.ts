const mockDynamoSend = jest.fn();
const mockKmsSend = jest.fn();
const mockAxiosGet = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  GetCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("@aws-sdk/client-kms", () => ({
  KMSClient: jest.fn().mockImplementation(() => ({ send: mockKmsSend })),
  DecryptCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("axios", () => ({
  default: { get: (...args: any[]) => mockAxiosGet(...args) },
  get: (...args: any[]) => mockAxiosGet(...args)
}));

process.env.USERS_TABLE = "users";

import { handler } from "../lambda/get-jira-stories/index";

describe("get-jira-stories", () => {
  const userWithJira = {
    username: "testuser",
    jiraToken: Buffer.from("encrypted").toString("base64"),
    jiraEmail: "jira@test.com",
    jiraBaseUrl: "https://jira.example.com",
    storyPointsFieldId: "customfield_10016"
  };

  const makeEvent = (queryParams?: any) => ({
    requestContext: {
      authorizer: {
        lambda: { username: "testuser", email: "test@test.com", firstName: "Test", lastName: "User", role: "user" }
      }
    },
    queryStringParameters: queryParams || null
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 404 when jira token is missing", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { ...userWithJira, jiraToken: null } });
    const result = await handler(makeEvent({ projectKey: "PROJ" }));
    expect(result.statusCode).toBe(404);
  });

  it("returns 400 when project key is not provided", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: userWithJira });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("No project key provided");
  });

  it("returns 200 with stories from Jira", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: userWithJira });
    mockKmsSend.mockResolvedValueOnce({ Plaintext: new TextEncoder().encode("decrypted-token") });
    mockAxiosGet.mockResolvedValueOnce({
      data: {
        issues: [
          {
            key: "PROJ-1",
            fields: {
              summary: "Story 1",
              description: {
                content: [{ content: [{ text: "Description 1" }] }]
              }
            }
          },
          {
            key: "PROJ-2",
            fields: {
              summary: "Story 2",
              description: null
            }
          }
        ]
      }
    });

    const result = await handler(makeEvent({ projectKey: "PROJ" }));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.stories).toHaveLength(2);
    expect(body.stories[0]).toEqual({ key: "PROJ-1", name: "Story 1", description: "Description 1" });
    expect(body.stories[1]).toEqual({ key: "PROJ-2", name: "Story 2", description: null });
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(makeEvent({ projectKey: "PROJ" }));
    expect(result.statusCode).toBe(500);
  });
});
