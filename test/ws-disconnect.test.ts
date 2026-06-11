const mockDynamoSend = jest.fn();
const mockApiGwSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  GetCommand: jest.fn().mockImplementation((input) => input),
  DeleteCommand: jest.fn().mockImplementation((input) => input),
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

process.env.WS_CONNECTIONS_TABLE = "ws-connections";
process.env.WS_CONNECTIONS_TABLE_INDEX = "roomId-index";

import { handler } from "../lambda/ws-disconnect/index";

describe("ws-disconnect", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeEvent = () => ({
    requestContext: {
      connectionId: "conn1",
      domainName: "ws.example.com"
    }
  });

  it("returns 200 when connection not found in database", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
  });

  it("deletes connection and notifies other players", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { connectionId: "conn1", roomId: "room1", username: "testuser" }
    });
    mockDynamoSend.mockResolvedValueOnce({});
    mockDynamoSend.mockResolvedValueOnce({
      Items: [
        { connectionId: "conn2", username: "user2" },
        { connectionId: "conn3", username: "user3" }
      ]
    });
    mockApiGwSend.mockResolvedValue({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalledTimes(2);
  });

  it("returns 200 even when no other connections in room", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { connectionId: "conn1", roomId: "room1", username: "testuser" }
    });
    mockDynamoSend.mockResolvedValueOnce({});
    mockDynamoSend.mockResolvedValueOnce({ Items: [] });

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(500);
  });
});
