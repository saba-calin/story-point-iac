const mockDynamoSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  UpdateCommand: jest.fn().mockImplementation((input) => input),
  QueryCommand: jest.fn().mockImplementation((input) => input),
  BatchWriteCommand: jest.fn().mockImplementation((input) => input)
}));

process.env.USERS_TABLE = "users";
process.env.REFRESH_TOKENS_TABLE = "refresh-tokens";
process.env.REFRESH_TOKENS_TABLE_INDEX = "username-index";

import { handler } from "../lambda/ban-user/index";

describe("ban-user", () => {
  const makeEvent = (body: object) => ({
    requestContext: {
      authorizer: {
        lambda: { username: "admin1", email: "admin@test.com", firstName: "Admin", lastName: "User", role: "admin" }
      }
    },
    body: JSON.stringify(body)
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when username is missing", async () => {
    const result = await handler(makeEvent({}));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Missing required fields");
  });

  it("returns 400 when trying to ban yourself", async () => {
    const result = await handler(makeEvent({ username: "admin1" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Cannot ban yourself");
  });

  it("returns 200 on successful ban and deletes refresh tokens", async () => {
    mockDynamoSend.mockResolvedValueOnce({});
    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ refreshTokenHash: "hash1" }, { refreshTokenHash: "hash2" }]
    });
    mockDynamoSend.mockResolvedValueOnce({});

    const result = await handler(makeEvent({ username: "baduser" }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe("User banned successfully");
  });

  it("returns 200 when user has no refresh tokens", async () => {
    mockDynamoSend.mockResolvedValueOnce({});
    mockDynamoSend.mockResolvedValueOnce({ Items: [] });

    const result = await handler(makeEvent({ username: "baduser" }));
    expect(result.statusCode).toBe(200);
  });

  it("returns 404 when user not found", async () => {
    const error: any = new Error("Condition failed");
    error.name = "ConditionalCheckFailedException";
    error.Item = undefined;
    mockDynamoSend.mockRejectedValueOnce(error);

    const result = await handler(makeEvent({ username: "nonexistent" }));
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe("User not found");
  });

  it("returns 400 when trying to ban an admin", async () => {
    const error: any = new Error("Condition failed");
    error.name = "ConditionalCheckFailedException";
    error.Item = { role: { S: "admin" } };
    mockDynamoSend.mockRejectedValueOnce(error);

    const result = await handler(makeEvent({ username: "otheradmin" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Cannot ban an admin");
  });

  it("returns 400 when user is already banned", async () => {
    const error: any = new Error("Condition failed");
    error.name = "ConditionalCheckFailedException";
    error.Item = { role: { S: "user" }, isBanned: { BOOL: true } };
    mockDynamoSend.mockRejectedValueOnce(error);

    const result = await handler(makeEvent({ username: "banneduser" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("User is already banned");
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(makeEvent({ username: "baduser" }));
    expect(result.statusCode).toBe(500);
  });
});
