const mockSend = jest.fn();
const mockVerify = jest.fn();

jest.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input) => input)
}));

jest.mock("jsonwebtoken", () => ({
  verify: (...args: any[]) => mockVerify(...args),
  sign: jest.fn()
}));

process.env.JWT_SECRET_ARN = "arn:aws:secretsmanager:us-east-1:123:secret:jwt";

import { handler } from "../lambda/authorizer/index";

describe("authorizer", () => {
  const mockCallback = jest.fn();
  const jwtSecret = "test-secret";

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({ secret: jwtSecret })
    });
  });

  it("calls back with Unauthorized when no cookie is present", async () => {
    const event = {
      headers: { cookie: "" },
      routeArn: "arn:aws:execute-api:us-east-1:123:api/stage/GET/resource",
      requestContext: { routeKey: "GET /auth/me" }
    };

    await handler(event, {}, mockCallback);
    expect(mockCallback).toHaveBeenCalledWith("Unauthorized", null);
  });

  it("calls back with Unauthorized when JWT is expired", async () => {
    const event = {
      headers: { cookie: "sp-access=expired-token" },
      routeArn: "arn:aws:execute-api:us-east-1:123:api/stage/GET/resource",
      requestContext: { routeKey: "GET /auth/me" }
    };

    mockVerify.mockImplementation(() => {
      const err: any = new Error("jwt expired");
      err.name = "TokenExpiredError";
      throw err;
    });

    await handler(event, {}, mockCallback);
    expect(mockCallback).toHaveBeenCalledWith("Unauthorized", null);
  });

  it("calls back with Unauthorized when JWT is invalid", async () => {
    const event = {
      headers: { cookie: "sp-access=invalid-token" },
      routeArn: "arn:aws:execute-api:us-east-1:123:api/stage/GET/resource",
      requestContext: { routeKey: "GET /auth/me" }
    };

    mockVerify.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    await handler(event, {}, mockCallback);
    expect(mockCallback).toHaveBeenCalledWith("Unauthorized", null);
  });

  it("calls back with Unauthorized when user role is not allowed for route", async () => {
    const event = {
      headers: { cookie: "sp-access=valid-token" },
      routeArn: "arn:aws:execute-api:us-east-1:123:api/stage/GET/resource",
      requestContext: { routeKey: "GET /admin/cost-explorer" }
    };

    mockVerify.mockReturnValue({
      username: "testuser",
      email: "test@test.com",
      firstName: "Test",
      lastName: "User",
      role: "user"
    });

    await handler(event, {}, mockCallback);
    expect(mockCallback).toHaveBeenCalledWith("Unauthorized", null);
  });

  it("returns Allow policy when JWT is valid and role is authorized", async () => {
    const payload = {
      username: "admin1",
      email: "admin@test.com",
      firstName: "Admin",
      lastName: "User",
      role: "admin"
    };

    const event = {
      headers: { cookie: "sp-access=valid-token" },
      routeArn: "arn:aws:execute-api:us-east-1:123:api/stage/GET/resource",
      requestContext: { routeKey: "GET /admin/cost-explorer" }
    };

    mockVerify.mockReturnValue(payload);

    await handler(event, {}, mockCallback);
    expect(mockCallback).toHaveBeenCalledWith(null, {
      principalId: "admin1",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [{
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: event.routeArn
        }]
      },
      context: payload
    });
  });

  it("reads Cookie header with capital C", async () => {
    const payload = {
      username: "testuser",
      email: "test@test.com",
      firstName: "Test",
      lastName: "User",
      role: "user"
    };

    const event = {
      headers: { Cookie: "sp-access=valid-token" },
      routeArn: "arn:aws:execute-api:us-east-1:123:api/stage/GET/resource",
      requestContext: { routeKey: "GET /auth/me" }
    };

    mockVerify.mockReturnValue(payload);

    await handler(event, {}, mockCallback);
    expect(mockCallback).toHaveBeenCalledWith(null, expect.objectContaining({
      principalId: "testuser"
    }));
  });
});
