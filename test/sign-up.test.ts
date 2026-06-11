const mockDynamoSend = jest.fn();
const mockSecretsSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  PutCommand: jest.fn().mockImplementation((input) => input),
  TransactWriteCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: mockSecretsSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed-password")
}));
jest.mock("jsonwebtoken", () => ({
  sign: jest.fn().mockReturnValue("mock-access-token")
}));

process.env.USERS_TABLE = "users";
process.env.USER_EMAILS_TABLE = "user-emails";
process.env.REFRESH_TOKENS_TABLE = "refresh-tokens";
process.env.JWT_SECRET_ARN = "arn:aws:secretsmanager:us-east-1:123:secret:jwt";
process.env.ROOT_DOMAIN = "example.com";
process.env.PASSWORD_SALT_ROUNDS = "10";
process.env.ACCESS_TOKEN_EXPIRY_MINUTES = "15";
process.env.REFRESH_TOKEN_EXPIRY_DAYS = "7";

import { handler } from "../lambda/sign-up/index";

describe("sign-up", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecretsSend.mockResolvedValue({
      SecretString: JSON.stringify({ secret: "jwt-secret" })
    });
    mockDynamoSend.mockResolvedValue({});
  });

  it("returns 400 when required fields are missing", async () => {
    const event = { body: JSON.stringify({ firstName: "Test" }) };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Missing required fields");
  });

  it("returns 400 when email format is invalid", async () => {
    const event = {
      body: JSON.stringify({
        firstName: "Test",
        lastName: "User",
        username: "testuser",
        email: "invalid-email",
        password: "password123"
      })
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Invalid email format");
  });

  it("returns 400 when password is too short", async () => {
    const event = {
      body: JSON.stringify({
        firstName: "Test",
        lastName: "User",
        username: "testuser",
        email: "test@test.com",
        password: "short"
      })
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Password must be at least 8 characters");
  });

  it("returns 201 on successful sign-up with cookies", async () => {
    const event = {
      body: JSON.stringify({
        firstName: "Test",
        lastName: "User",
        username: "testuser",
        email: "test@test.com",
        password: "password123"
      })
    };
    const result = await handler(event);
    expect(result.statusCode).toBe(201);

    const body = JSON.parse(result.body);
    expect(body.message).toBe("User created successfully");
    expect(body.userContext.username).toBe("testuser");
    expect(body.userContext.email).toBe("test@test.com");
    expect(body.userContext.role).toBe("user");
    expect((result as any).cookies).toHaveLength(2);
    expect((result as any).cookies[0]).toContain("sp-access=");
    expect((result as any).cookies[1]).toContain("sp-refresh=");
  });

  it("returns 409 when username already exists", async () => {
    const event = {
      body: JSON.stringify({
        firstName: "Test",
        lastName: "User",
        username: "testuser",
        email: "test@test.com",
        password: "password123"
      })
    };

    const error: any = new Error("Transaction cancelled");
    error.name = "TransactionCanceledException";
    error.CancellationReasons = [{ Code: "ConditionalCheckFailed" }, {}];
    mockDynamoSend.mockRejectedValueOnce(error);

    const result = await handler(event);
    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).message).toBe("Username already exists");
  });

  it("returns 409 when email already exists", async () => {
    const event = {
      body: JSON.stringify({
        firstName: "Test",
        lastName: "User",
        username: "testuser",
        email: "test@test.com",
        password: "password123"
      })
    };

    const error: any = new Error("Transaction cancelled");
    error.name = "TransactionCanceledException";
    error.CancellationReasons = [{}, { Code: "ConditionalCheckFailed" }];
    mockDynamoSend.mockRejectedValueOnce(error);

    const result = await handler(event);
    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).message).toBe("Email already exists");
  });

  it("returns 500 on unexpected error", async () => {
    const event = {
      body: JSON.stringify({
        firstName: "Test",
        lastName: "User",
        username: "testuser",
        email: "test@test.com",
        password: "password123"
      })
    };

    mockDynamoSend.mockRejectedValueOnce(new Error("DynamoDB error"));

    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
