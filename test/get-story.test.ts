const mockDynamoSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  QueryCommand: jest.fn().mockImplementation((input) => input)
}));

process.env.STORIES_TABLE = "stories";

import { handler } from "../lambda/get-story/index";

describe("get-story", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when roomId is missing", async () => {
    const event = { pathParameters: {} };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("No room id provided");
  });

  it("returns 200 with stories for a room", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Items: [
        { roomId: "room1", storyId: "story1", name: "Story 1", status: "ACTIVE" },
        { roomId: "room1", storyId: "story2", name: "Story 2", status: "NON_ACTIVE" }
      ]
    });

    const event = { pathParameters: { roomId: "room1" } };
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.stories).toHaveLength(2);
  });

  it("returns empty array when no stories exist", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Items: [] });
    const event = { pathParameters: { roomId: "room1" } };
    const result = await handler(event);
    const body = JSON.parse(result.body);
    expect(body.stories).toEqual([]);
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const event = { pathParameters: { roomId: "room1" } };
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
