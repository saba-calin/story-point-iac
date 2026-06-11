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
jest.mock("uuidv7", () => ({
  uuidv7: jest.fn().mockReturnValue("story-uuid-1234")
}));

process.env.ROOMS_TABLE = "rooms";
process.env.STORIES_TABLE = "stories";
process.env.WS_CONNECTIONS_TABLE = "ws-connections";
process.env.WS_CONNECTIONS_TABLE_INDEX = "roomId-index";

import { handler } from "../lambda/ws-create-story/index";

describe("ws-create-story", () => {
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

  it("sends error when room is not found", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const result = await handler(makeEvent({ action: "createStory", roomId: "room1", name: "Story" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when room is closed", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", status: "CLOSED", ownerUsername: "owner" }
    });
    const result = await handler(makeEvent({ action: "createStory", roomId: "room1", name: "Story" }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("sends error when user is not the room owner", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", status: "OPEN", ownerUsername: "owner" }
    });
    const result = await handler(makeEvent({ action: "createStory", roomId: "room1", name: "Story" }, "notowner"));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("creates story and broadcasts to all connections", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", status: "OPEN", ownerUsername: "owner" }
    });
    mockDynamoSend.mockResolvedValueOnce({});
    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ connectionId: "conn1" }, { connectionId: "conn2" }]
    });

    const result = await handler(makeEvent({
      action: "createStory",
      roomId: "room1",
      name: "Story 1",
      description: "Desc"
    }));
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(makeEvent({ action: "createStory", roomId: "room1", name: "Story" }));
    expect(result.statusCode).toBe(500);
  });
});
