const mockDynamoSend = jest.fn();
const mockSecretsSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  GetCommand: jest.fn().mockImplementation((input) => input),
  PutCommand: jest.fn().mockImplementation((input) => input),
  DeleteCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: mockSecretsSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("jsonwebtoken", () => ({
  sign: jest.fn().mockReturnValue("new-access-token")
}));

process.env.REFRESH_TOKENS_TABLE = "refresh-tokens";
process.env.USERS_TABLE = "users";
process.env.JWT_SECRET_ARN = "arn:aws:secretsmanager:us-east-1:123:secret:jwt";
process.env.ROOT_DOMAIN = "example.com";
process.env.ACCESS_TOKEN_EXPIRY_MINUTES = "15";
process.env.REFRESH_TOKEN_EXPIRY_DAYS = "7";

import { handler } from "../lambda/refresh/index";

describe("refresh", () => {
  const validUser = {
    username: "testuser",
    email: "test@test.com",
    firstName: "Test",
    lastName: "User",
    password: "hashed",
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

  it("returns 401 when no refresh token is provided", async () => {
    const event = { cookies: [] };
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe("No refresh token provided");
  });

  it("returns 401 when refresh token is not found in database", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const event = { cookies: ["sp-refresh=invalid-token"] };
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe("Invalid refresh token");
  });

  it("returns 401 when refresh token is expired", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { refreshTokenHash: "hash", username: "testuser", expiresAt: Date.now() - 1000 }
    });
    const event = { cookies: ["sp-refresh=expired-token"] };
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe("Refresh token expired");
  });

  it("returns 401 when user is not found", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { refreshTokenHash: "hash", username: "testuser", expiresAt: Date.now() + 100000 }
    });
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const event = { cookies: ["sp-refresh=valid-token"] };
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe("User not found");
  });

  it("returns 401 and deletes token when user is banned", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { refreshTokenHash: "hash", username: "testuser", expiresAt: Date.now() + 100000 }
    });
    mockDynamoSend.mockResolvedValueOnce({ Item: { ...validUser, isBanned: true } });
    mockDynamoSend.mockResolvedValueOnce({});
    const event = { cookies: ["sp-refresh=valid-token"] };
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe("Account is banned");
  });

  it("returns 201 with new tokens on successful refresh", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { refreshTokenHash: "hash", username: "testuser", expiresAt: Date.now() + 100000 }
    });
    mockDynamoSend.mockResolvedValueOnce({ Item: validUser });
    mockDynamoSend.mockResolvedValue({});
    const event = { cookies: ["sp-refresh=valid-token"] };
    const result = await handler(event);
    expect(result.statusCode).toBe(201);

    const body = JSON.parse(result.body);
    expect(body.message).toBe("Token refreshed successfully");
    expect(body.userContext.username).toBe("testuser");
    expect((result as any).cookies).toHaveLength(2);
    expect((result as any).cookies[0]).toContain("sp-access=");
    expect((result as any).cookies[1]).toContain("sp-refresh=");
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const event = { cookies: ["sp-refresh=token"] };
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
