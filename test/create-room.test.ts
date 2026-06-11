const mockDynamoSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  PutCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("node:crypto", () => ({
  randomUUID: jest.fn().mockReturnValue("uuid-1234")
}));

process.env.ROOMS_TABLE = "rooms";

import { handler } from "../lambda/create-room/index";

describe("create-room", () => {
  const makeEvent = (body: object) => ({
    requestContext: {
      authorizer: {
        lambda: { username: "testuser", email: "test@test.com", firstName: "Test", lastName: "User", role: "user" }
      }
    },
    body: JSON.stringify(body)
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDynamoSend.mockResolvedValue({});
  });

  it("returns 400 when name is missing", async () => {
    const result = await handler(makeEvent({}));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Missing required fields");
  });

  it("returns 201 with room record on success", async () => {
    const result = await handler(makeEvent({ name: "Sprint Planning" }));
    expect(result.statusCode).toBe(201);

    const body = JSON.parse(result.body);
    expect(body.roomId).toBe("uuid-1234");
    expect(body.name).toBe("Sprint Planning");
    expect(body.ownerUsername).toBe("testuser");
    expect(body.status).toBe("OPEN");
  });

  it("returns 500 on DynamoDB error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(makeEvent({ name: "Room" }));
    expect(result.statusCode).toBe(500);
  });
});
