const mockApiGwSend = jest.fn();

jest.mock("@aws-sdk/client-apigatewaymanagementapi", () => ({
  ApiGatewayManagementApiClient: jest.fn().mockImplementation(() => ({ send: mockApiGwSend })),
  PostToConnectionCommand: jest.fn().mockImplementation((input) => input)
}));

import { handler } from "../lambda/ws-test/index";

describe("ws-test", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGwSend.mockResolvedValue({});
  });

  it("returns 200 and sends message back to connection", async () => {
    const event = {
      requestContext: {
        connectionId: "conn1",
        domainName: "ws.example.com",
        stage: "prod"
      }
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(mockApiGwSend).toHaveBeenCalled();
  });

  it("returns 500 when sending message fails", async () => {
    mockApiGwSend.mockRejectedValueOnce(new Error("Connection gone"));
    const event = {
      requestContext: {
        connectionId: "conn1",
        domainName: "ws.example.com",
        stage: "prod"
      }
    };

    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
