const mockDynamoSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  ScanCommand: jest.fn().mockImplementation((input) => input)
}));

process.env.USERS_TABLE = "users";
process.env.USERS_PAGE_SIZE = "20";

import { handler } from "../lambda/get-user/index";

describe("get-user", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeEvent = (queryParams?: any) => ({
    requestContext: {
      authorizer: {
        lambda: { username: "admin1", email: "admin@test.com", firstName: "Admin", lastName: "User", role: "admin" }
      }
    },
    queryStringParameters: queryParams || null
  });

  it("returns 200 with paginated users", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Items: [
        { username: "user1", email: "u1@test.com", role: "user" },
        { username: "user2", email: "u2@test.com", role: "user" }
      ],
      LastEvaluatedKey: undefined
    });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.users).toHaveLength(2);
    expect(body.hasMore).toBe(false);
  });

  it("returns nextToken when there are more results", async () => {
    const lastKey = { username: "user5" };
    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ username: "user1" }],
      LastEvaluatedKey: lastKey
    });

    const result = await handler(makeEvent());
    const body = JSON.parse(result.body);
    expect(body.hasMore).toBe(true);
    expect(body.nextToken).toBe(Buffer.from(JSON.stringify(lastKey)).toString("base64"));
  });

  it("supports custom limit parameter", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    const result = await handler(makeEvent({ limit: "5" }));
    expect(result.statusCode).toBe(200);
  });

  it("returns 400 when nextToken is invalid", async () => {
    const result = await handler(makeEvent({ nextToken: "not-valid-json-base64" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Invalid pagination token");
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});
