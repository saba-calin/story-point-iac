const mockDynamoSend = jest.fn();
const mockApiGwSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  GetCommand: jest.fn().mockImplementation((input) => input),
  QueryCommand: jest.fn().mockImplementation((input) => input),
  UpdateCommand: jest.fn().mockImplementation((input) => input)
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
process.env.ROOM_PARTICIPANTS_TABLE = "room-participants";
process.env.WS_CONNECTIONS_TABLE = "ws-connections";
process.env.WS_CONNECTIONS_TABLE_INDEX = "roomId-index";

import { handler } from "../lambda/ws-vote/index";

describe("ws-vote", () => {
  const makeEvent = (body: object) => ({
    requestContext: {
      connectionId: "conn1",
      domainName: "ws.example.com",
      authorizer: { username: "testuser", email: "test@test.com", firstName: "Test", lastName: "User", role: "user" }
    },
    body: JSON.stringify(body)
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGwSend.mockResolvedValue({});
  });

  it("sends error when vote value is invalid", async () => {
    const result = await handler(makeEvent({ action: "vote", roomId: "room1", storyId: "s1", voteValue: "99" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when room not found", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const result = await handler(makeEvent({ action: "vote", roomId: "room1", storyId: "s1", voteValue: "5" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when room is closed", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", status: "CLOSED" }
    });
    const result = await handler(makeEvent({ action: "vote", roomId: "room1", storyId: "s1", voteValue: "5" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when story not found", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { roomId: "room1", status: "OPEN" } });
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const result = await handler(makeEvent({ action: "vote", roomId: "room1", storyId: "s1", voteValue: "5" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when story is not active", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { roomId: "room1", status: "OPEN" } });
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", storyId: "s1", status: "NON_ACTIVE", storyEstimation: null }
    });
    const result = await handler(makeEvent({ action: "vote", roomId: "room1", storyId: "s1", voteValue: "5" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when story has already been estimated", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { roomId: "room1", status: "OPEN" } });
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", storyId: "s1", status: "ACTIVE", storyEstimation: 5 }
    });
    const result = await handler(makeEvent({ action: "vote", roomId: "room1", storyId: "s1", voteValue: "5" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when user is not a room participant", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { roomId: "room1", status: "OPEN" } });
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", storyId: "s1", status: "ACTIVE", storyEstimation: null }
    });
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const result = await handler(makeEvent({ action: "vote", roomId: "room1", storyId: "s1", voteValue: "5" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("records vote and broadcasts to all connections", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { roomId: "room1", status: "OPEN" } });
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", storyId: "s1", status: "ACTIVE", storyEstimation: null }
    });
    mockDynamoSend.mockResolvedValueOnce({ Item: { roomId: "room1", username: "testuser" } });
    mockDynamoSend.mockResolvedValueOnce({});
    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ connectionId: "conn1" }, { connectionId: "conn2" }]
    });

    const result = await handler(makeEvent({ action: "vote", roomId: "room1", storyId: "s1", voteValue: "5" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("accepts question mark as valid vote", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { roomId: "room1", status: "OPEN" } });
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", storyId: "s1", status: "ACTIVE", storyEstimation: null }
    });
    mockDynamoSend.mockResolvedValueOnce({ Item: { roomId: "room1", username: "testuser" } });
    mockDynamoSend.mockResolvedValueOnce({});
    mockDynamoSend.mockResolvedValueOnce({ Items: [{ connectionId: "conn1" }] });

    const result = await handler(makeEvent({ action: "vote", roomId: "room1", storyId: "s1", voteValue: "?" }));
    expect(result.statusCode).toBe(200);
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(makeEvent({ action: "vote", roomId: "room1", storyId: "s1", voteValue: "5" }));
    expect(result.statusCode).toBe(500);
  });
});
