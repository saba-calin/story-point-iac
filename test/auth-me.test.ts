const mockDynamoSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  GetCommand: jest.fn().mockImplementation((input) => input)
}));

process.env.USERS_TABLE = "users";

import { handler } from "../lambda/auth-me/index";

describe("auth-me", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeEvent = (username = "testuser") => ({
    requestContext: {
      authorizer: {
        lambda: { username, email: "test@test.com", firstName: "Test", lastName: "User", role: "user" }
      }
    }
  });

  it("returns 200 with user data excluding sensitive fields", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: {
        username: "testuser",
        email: "test@test.com",
        firstName: "Test",
        lastName: "User",
        role: "user",
        isBanned: false,
        profilePictureKey: "pic.jpg",
        password: "hashed-password",
        jiraToken: "enc-token",
        jiraBaseUrl: "https://jira.example.com",
        jiraEmail: "jira@test.com",
        storyPointsFieldId: "customfield_10016"
      }
    });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.username).toBe("testuser");
    expect(body.hasJiraAccess).toBe(true);
    expect(body.password).toBeUndefined();
    expect(body.jiraToken).toBeUndefined();
    expect(body.jiraBaseUrl).toBeUndefined();
    expect(body.jiraEmail).toBeUndefined();
    expect(body.storyPointsFieldId).toBeUndefined();
  });

  it("returns hasJiraAccess false when jira fields are missing", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: {
        username: "testuser",
        email: "test@test.com",
        firstName: "Test",
        lastName: "User",
        role: "user",
        isBanned: false,
        profilePictureKey: null,
        password: "hashed",
        jiraToken: null,
        jiraBaseUrl: null,
        jiraEmail: null,
        storyPointsFieldId: null
      }
    });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.hasJiraAccess).toBe(false);
  });

  it("returns 400 when user is not found", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(400);
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});
