const mockDynamoSend = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  GetCommand: jest.fn().mockImplementation((input) => input),
  UpdateCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue("new-hashed-password")
}));

process.env.USERS_TABLE = "users";
process.env.PASSWORD_SALT_ROUNDS = "10";

import { handler } from "../lambda/change-password/index";
import * as bcrypt from "bcryptjs";

describe("change-password", () => {
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
  });

  it("returns 400 when required fields are missing", async () => {
    const result = await handler(makeEvent({ currentPassword: "old" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Missing required fields");
  });

  it("returns 400 when new password is too short", async () => {
    const result = await handler(makeEvent({ currentPassword: "oldpass1", newPassword: "short" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("The new password must be at least 8 characters");
  });

  it("returns 400 when new password is same as current", async () => {
    const result = await handler(makeEvent({ currentPassword: "samepass1", newPassword: "samepass1" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("The new password must be different from the current one");
  });

  it("returns 400 when user not found", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: null });
    const result = await handler(makeEvent({ currentPassword: "oldpass1", newPassword: "newpass12" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Invalid username");
  });

  it("returns 400 when current password is incorrect", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { username: "testuser", password: "hashed" } });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const result = await handler(makeEvent({ currentPassword: "wrongpass", newPassword: "newpass12" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("The current password is incorrect");
  });

  it("returns 200 on successful password change", async () => {
    mockDynamoSend.mockResolvedValueOnce({ Item: { username: "testuser", password: "hashed" } });
    mockDynamoSend.mockResolvedValueOnce({});
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await handler(makeEvent({ currentPassword: "oldpass1", newPassword: "newpass12" }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe("Password updated successfully");
  });

  it("returns 500 on unexpected error", async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error("DB error"));
    const result = await handler(makeEvent({ currentPassword: "oldpass1", newPassword: "newpass12" }));
    expect(result.statusCode).toBe(500);
  });
});
