const mockDynamoSend = jest.fn();
const mockGetSignedUrl = jest.fn();

jest.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));
jest.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockReturnValue({ send: mockDynamoSend }) },
  UpdateCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation((input) => input)
}));
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: any[]) => mockGetSignedUrl(...args)
}));

process.env.USERS_TABLE = "users";
process.env.MAX_IMAGE_SIZE_BYTES = "5";
process.env.CDN_BUCKET_NAME = "cdn-bucket";

import { handler } from "../lambda/get-avatar-upload-url/index";

describe("get-avatar-upload-url", () => {
  const makeEvent = (queryParams: any) => ({
    requestContext: {
      authorizer: {
        lambda: { username: "testuser", email: "test@test.com", firstName: "Test", lastName: "User", role: "user" }
      }
    },
    queryStringParameters: queryParams
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSignedUrl.mockResolvedValue("https://s3.example.com/signed-url");
    mockDynamoSend.mockResolvedValue({});
  });

  it("returns 400 when image type is unsupported", async () => {
    const result = await handler(makeEvent({ imageType: "image/gif", imageSize: "1000" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Unsupported image type");
  });

  it("returns 400 when image type is missing", async () => {
    const result = await handler(makeEvent({ imageSize: "1000" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Unsupported image type");
  });

  it("returns 400 when image size is 0", async () => {
    const result = await handler(makeEvent({ imageType: "image/png", imageSize: "0" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Image size must be greater than 0");
  });

  it("returns 400 when image size exceeds limit", async () => {
    const result = await handler(makeEvent({ imageType: "image/png", imageSize: "99999999" }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Image size exceeds limit");
  });

  it("returns 200 with upload url for valid request", async () => {
    const result = await handler(makeEvent({ imageType: "image/png", imageSize: "1000" }));
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.uploadUrl).toBe("https://s3.example.com/signed-url");
    expect(body.profilePictureKey).toContain("profile-pictures/testuser-");
    expect(body.profilePictureKey).toContain(".png");
  });

  it("returns 500 on unexpected error", async () => {
    mockGetSignedUrl.mockRejectedValueOnce(new Error("S3 error"));
    const result = await handler(makeEvent({ imageType: "image/png", imageSize: "1000" }));
    expect(result.statusCode).toBe(500);
  });
});
