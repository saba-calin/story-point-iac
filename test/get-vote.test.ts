const mockDynamoSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  GetCommand: jest.fn().mockImplementation((input) => input),
  QueryCommand: jest.fn().mockImplementation((input) => input)
}));

process.env.STORIES_TABLE = "stories";
process.env.VOTES_TABLE = "votes";

import { handler } from "../lambda/get-vote/index";

describe("get-vote", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when roomId is missing", async () => {
    const event = { pathParameters: { storyId: "story1" } };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("No room id provided");
  });

  it("returns 400 when storyId is missing", async () => {
    const event = { pathParameters: { roomId: "room1" } };
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("No story id provided");
  });

  it("returns empty votes when story has no estimation", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", storyId: "story1", storyEstimation: null }
    });

    const event = { pathParameters: { roomId: "room1", storyId: "story1" } };
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).votes).toEqual([]);
  });

  it("returns votes when story has been estimated", async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { roomId: "room1", storyId: "story1", storyEstimation: 5 }
    });
    mockDynamoSend.mockResolvedValueOnce({
      Items: [
        { storyId: "story1", username: "user1", voteValue: "5" },
        { storyId: "story1", username: "user2", voteValue: "8" }
      ]
    });

    const event = { pathParameters: { roomId: "room1", storyId: "story1" } };
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.votes).toHaveLength(2);
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const event = { pathParameters: { roomId: "room1", storyId: "story1" } };
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
