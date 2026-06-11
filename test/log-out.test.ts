const mockDynamoSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  DeleteCommand: jest.fn().mockImplementation((input) => input)
}));

process.env.REFRESH_TOKENS_TABLE = "refresh-tokens";
process.env.ROOT_DOMAIN = "example.com";

import { handler } from "../lambda/log-out/index";

describe("log-out", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDynamoSend.mockResolvedValue({});
  });

  it("returns 200 and clears cookies when refresh token is present", async () => {
    const event = { cookies: ["sp-refresh=some-refresh-token"] };
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe("Logged out successfully");
    expect((result as any).cookies[0]).toContain("Max-Age=0");
    expect((result as any).cookies[1]).toContain("Max-Age=0");
    expect(mockDynamoSend).toHaveBeenCalled();
  });

  it("returns 200 and clears cookies even when no refresh token", async () => {
    const event = { cookies: [] };
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(mockDynamoSend).not.toHaveBeenCalled();
  });

  it("returns 200 when cookies field is undefined", async () => {
    const event = {};
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });

  it("returns 500 on unexpected error", async () => {
    const event = { cookies: ["sp-refresh=token"] };
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
