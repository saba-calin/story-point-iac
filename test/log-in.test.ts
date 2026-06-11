const mockDynamoSend = jest.fn();
const mockSecretsSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  GetCommand: jest.fn().mockImplementation((input) => input),
  PutCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: mockSecretsSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("bcryptjs", () => ({
  compare: jest.fn()
}));
jest.mock("jsonwebtoken", () => ({
  sign: jest.fn().mockReturnValue("mock-access-token")
}));

process.env.USERS_TABLE = "users";
process.env.REFRESH_TOKENS_TABLE = "refresh-tokens";
process.env.JWT_SECRET_ARN = "arn:aws:secretsmanager:us-east-1:123:secret:jwt";
process.env.ROOT_DOMAIN = "example.com";
process.env.ACCESS_TOKEN_EXPIRY_MINUTES = "15";
process.env.REFRESH_TOKEN_EXPIRY_DAYS = "7";

import { handler } from "../lambda/log-in/index";
import * as bcrypt from "bcryptjs";

describe("log-in", () => {
  const validUser = {
    username: "testuser",
    email: "test@test.com",
    firstName: "Test",
    lastName: "User",
    password: "hashed-password",
    role: "user",
    isBanned: false,
    profilePictureKey: "pic.jpg",
    jiraToken: null,
    jiraBaseUrl: null,
    jiraEmail: null,
    storyPointsFieldId: null
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSecretsSend.mockResolvedValue({
      SecretString: JSON.stringify({ secret: "jwt-secret" })
    });
  });

  it("returns 400 when required fields are missing", async () => {
    const event = { body: JSON.stringify({ username: "testuser" }) };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Missing required fields");
  });

  it("returns 400 when user is not found", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const event = { body: JSON.stringify({ username: "unknown", password: "pass1234" }) };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Invalid credentials");
  });

  it("returns 400 when user is banned", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { ...validUser, isBanned: true } });
    const event = { body: JSON.stringify({ username: "testuser", password: "pass1234" }) };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Account is banned");
  });

  it("returns 400 when password does not match", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: validUser });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const event = { body: JSON.stringify({ username: "testuser", password: "wrongpass" }) };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Invalid credentials");
  });

  it("returns 200 with cookies on successful login", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: validUser });
    mockDynamoSend.mockResolvedValueOnce({});
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const event = { body: JSON.stringify({ username: "testuser", password: "correct" }) };
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.message).toBe("Logged in successfully");
    expect(body.userContext.username).toBe("testuser");
    expect(body.userContext.profilePictureKey).toBe("pic.jpg");
    expect(body.userContext.hasJiraAccess).toBeNull();
    expect((result as any).cookies).toHaveLength(2);
  });

  it("sets hasJiraAccess to true when all jira fields are present", async () => {
    const userWithJira = {
      ...validUser,
      jiraToken: "enc-token",
      jiraBaseUrl: "https://jira.example.com",
      jiraEmail: "jira@test.com",
      storyPointsFieldId: "customfield_10016"
    };
    mockDynamoSend.mockResolvedValueOnce({ Item: userWithJira });
    mockDynamoSend.mockResolvedValueOnce({});
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const event = { body: JSON.stringify({ username: "testuser", password: "correct" }) };
    const result = await handler(event);
    const body = JSON.parse(result.body);
    expect(body.userContext.hasJiraAccess).toBe(true);
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const event = { body: JSON.stringify({ username: "testuser", password: "pass1234" }) };
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
