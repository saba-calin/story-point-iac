const mockDynamoSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  QueryCommand: jest.fn().mockImplementation((input) => input),
  ScanCommand: jest.fn().mockImplementation((input) => input)
}));

process.env.ROOMS_TABLE = "rooms";
process.env.ROOM_PARTICIPANTS_TABLE = "room-participants";
process.env.ROOM_PARTICIPANTS_TABLE_INDEX = "username-index";
process.env.ROOMS_PAGE_SIZE = "10";

import { handler } from "../lambda/get-room/index";

describe("get-room", () => {
  const makeEvent = (role: string, queryParams?: any) => ({
    requestContext: {
      authorizer: {
        lambda: { username: "testuser", email: "test@test.com", firstName: "Test", lastName: "User", role }
      }
    },
    queryStringParameters: queryParams || null
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("scans all rooms for admin users", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ roomId: "room1", name: "Room 1" }],
      LastEvaluatedKey: undefined
    });

    const result = await handler(makeEvent("admin"));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.rooms).toHaveLength(1);
    expect(body.hasMore).toBe(false);
  });

  it("queries participant rooms for regular users", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ roomId: "room1", username: "testuser" }],
      LastEvaluatedKey: undefined
    });

    const result = await handler(makeEvent("user"));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.rooms).toHaveLength(1);
    expect(body.hasMore).toBe(false);
  });

  it("returns pagination token when there are more results", async () => {
    const lastKey = { roomId: "room5" };
    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ roomId: "room1" }],
      LastEvaluatedKey: lastKey
    });

    const result = await handler(makeEvent("admin"));
    const body = JSON.parse(result.body);
    expect(body.hasMore).toBe(true);
    expect(body.nextToken).toBe(Buffer.from(JSON.stringify(lastKey)).toString("base64"));
  });

  it("uses nextToken for pagination", async () => {
    const lastKey = { roomId: "room5" };
    const nextToken = Buffer.from(JSON.stringify(lastKey)).toString("base64");

    mockDynamoSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    const result = await handler(makeEvent("admin", { nextToken }));
    expect(result.statusCode).toBe(200);
  });

  it("returns 400 when nextToken is invalid", async () => {
    const result = await handler(makeEvent("admin", { nextToken: "invalid-base64!!!" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Invalid pagination token");
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(makeEvent("admin"));
    expect(result.statusCode).toBe(500);
  });
});
