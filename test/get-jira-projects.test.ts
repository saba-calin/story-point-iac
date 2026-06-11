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

import { handler } from "../lambda/get-jira-projects/index";

describe("get-jira-projects", () => {
  const makeEvent = () => ({
    requestContext: {
      authorizer: {
        lambda: { username: "testuser", email: "test@test.com", firstName: "Test", lastName: "User", role: "user" }
      }
    }
  });

  const userWithJira = {
    username: "testuser",
    jiraToken: Buffer.from("encrypted").toString("base64"),
    jiraEmail: "jira@test.com",
    jiraBaseUrl: "https://jira.example.com",
    storyPointsFieldId: "customfield_10016"
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 404 when user has no jira token", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { ...userWithJira, jiraToken: null } });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe("No Jira token found");
  });

  it("returns 404 when user has no jira email", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { ...userWithJira, jiraEmail: null } });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe("No Jira email found");
  });

  it("returns 404 when user has no jira base url", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { ...userWithJira, jiraBaseUrl: null } });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe("No Jira base url found");
  });

  it("returns 404 when user has no story points field", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { ...userWithJira, storyPointsFieldId: null } });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe("No story points field found");
  });

  it("returns 200 with project keys", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: userWithJira });
    mockKmsSend.mockResolvedValueOnce({ Plaintext: new TextEncoder().encode("decrypted-token") });
    mockAxiosGet.mockResolvedValueOnce({
      data: [
        { key: "PROJ1", name: "Project 1" },
        { key: "PROJ2", name: "Project 2" }
      ]
    });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.projects).toEqual(["PROJ1", "PROJ2"]);
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});
