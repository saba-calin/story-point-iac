const mockDynamoSend = jest.fn();
const mockApiGwSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  GetCommand: jest.fn().mockImplementation((input) => input),
  PutCommand: jest.fn().mockImplementation((input) => input),
  QueryCommand: jest.fn().mockImplementation((input) => input)
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
process.env.WS_CONNECTIONS_TABLE = "ws-connections";
process.env.ROOM_PARTICIPANTS_TABLE = "room-participants";
process.env.STORIES_TABLE = "stories";
process.env.VOTES_TABLE = "votes";
process.env.WS_CONNECTIONS_TABLE_INDEX = "roomId-index";

import { handler } from "../lambda/ws-join-room/index";

describe("ws-join-room", () => {
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

  it("sends error and closes connection when roomId is missing", async () => {
    const result = await handler(makeEvent({ action: "joinRoom" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when room is not found", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const result = await handler(makeEvent({ action: "joinRoom", roomId: "room1" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when room is closed", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", status: "CLOSED", ownerUsername: "owner" }
    });
    const result = await handler(makeEvent({ action: "joinRoom", roomId: "room1" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("joins room successfully and broadcasts to others", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", name: "Room 1", status: "OPEN", ownerUsername: "owner" }
    });
    mockDynamoSend.mockResolvedValueOnce({});
    mockDynamoSend.mockResolvedValueOnce({});
    mockDynamoSend.mockResolvedValueOnce({
      Items: [
        { connectionId: "conn1", username: "testuser", profilePictureKey: null },
        { connectionId: "conn2", username: "user2", profilePictureKey: null }
      ]
    });
    mockDynamoSend.mockResolvedValueOnce({ Items: [] });

    const result = await handler(makeEvent({ action: "joinRoom", roomId: "room1", profilePictureKey: "pic.jpg" }));
    expect(result.statusCode).toBe(200);
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(makeEvent({ action: "joinRoom", roomId: "room1" }));
    expect(result.statusCode).toBe(500);
  });
});
