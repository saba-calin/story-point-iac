const mockDynamoSend = jest.fn();
const mockApiGwSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  GetCommand: jest.fn().mockImplementation((input) => input),
  QueryCommand: jest.fn().mockImplementation((input) => input),
  UpdateCommand: jest.fn().mockImplementation((input) => input),
  BatchWriteCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: jest.fn().mockImplementation(() => ({ send: mockApiGwSend })),
  PostToConnectionCommand: jest.fn().mockImplementation((input) => input),
  DeleteConnectionCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("@smithy/node-http-handler", () => ({
  NodeHttpHandler: jest.fn()
}));

process.env.ROOMS_TABLE = "rooms";
process.env.STORIES_TABLE = "stories";
process.env.VOTES_TABLE = "votes";
process.env.WS_CONNECTIONS_TABLE = "ws-connections";
process.env.WS_CONNECTIONS_TABLE_INDEX = "roomId-index";

import { handler } from "../lambda/ws-revote/index";

describe("ws-revote", () => {
  const makeEvent = (body: object, username = "owner") => ({
    requestContext: {
      connectionId: "conn1",
      domainName: "ws.example.com",
      authorizer: { username, email: "test@test.com", firstName: "Test", lastName: "User", role: "user" }
    },
    body: JSON.stringify(body)
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGwSend.mockResolvedValue({});
  });

  it("sends error when room not found", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const result = await handler(makeEvent({ action: "revote", roomId: "room1", storyId: "s1" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when room is closed", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", status: "CLOSED", ownerUsername: "owner" }
    });
    const result = await handler(makeEvent({ action: "revote", roomId: "room1", storyId: "s1" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when user is not owner", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", status: "OPEN", ownerUsername: "owner" }
    });
    const result = await handler(makeEvent({ action: "revote", roomId: "room1", storyId: "s1" }, "notowner"));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when story not found", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", status: "OPEN", ownerUsername: "owner" }
    });
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const result = await handler(makeEvent({ action: "revote", roomId: "room1", storyId: "s1" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when story is not active", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", status: "OPEN", ownerUsername: "owner" }
    });
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", storyId: "s1", status: "NON_ACTIVE", storyEstimation: 5 }
    });
    const result = await handler(makeEvent({ action: "revote", roomId: "room1", storyId: "s1" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when story has not been estimated yet", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", status: "OPEN", ownerUsername: "owner" }
    });
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", storyId: "s1", status: "ACTIVE", storyEstimation: null }
    });
    const result = await handler(makeEvent({ action: "revote", roomId: "room1", storyId: "s1" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("deletes votes, removes estimation, and broadcasts", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", status: "OPEN", ownerUsername: "owner" }
    });
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", storyId: "s1", status: "ACTIVE", storyEstimation: 5 }
    });
    mockDynamoSend.mockResolvedValueOnce({
      Items: [
        { storyId: "s1", username: "user1", voteValue: "5" },
        { storyId: "s1", username: "user2", voteValue: "8" }
      ]
    });
    mockDynamoSend.mockResolvedValueOnce({});
    mockDynamoSend.mockResolvedValueOnce({});
    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ connectionId: "conn1" }, { connectionId: "conn2" }]
    });

    const result = await handler(makeEvent({ action: "revote", roomId: "room1", storyId: "s1" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("handles revote with no existing votes", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", status: "OPEN", ownerUsername: "owner" }
    });
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", storyId: "s1", status: "ACTIVE", storyEstimation: 5 }
    });
    mockDynamoSend.mockResolvedValueOnce({ Items: [] });
    mockDynamoSend.mockResolvedValueOnce({});
    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ connectionId: "conn1" }]
    });

    const result = await handler(makeEvent({ action: "revote", roomId: "room1", storyId: "s1" }));
    expect(result.statusCode).toBe(200);
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(makeEvent({ action: "revote", roomId: "room1", storyId: "s1" }));
    expect(result.statusCode).toBe(500);
  });
});
