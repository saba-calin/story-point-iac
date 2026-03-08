import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {ALLOWED_IMAGE_TYPES, generateErrorResponse, UserContext} from "../util";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, UpdateCommand} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client({});

const USERS_TABLE = process.env.USERS_TABLE!;

const MAX_IMAGE_SIZE_BYTES = 1024 * 1024 * parseInt(process.env.MAX_IMAGE_SIZE_BYTES!);
const CDN_BUCKET_NAME = process.env.CDN_BUCKET_NAME!;

export async function handler(event: any) {
  try {
    const userContext = event.requestContext.authorizer.lambda as UserContext;
    console.log(`Generating signed url for user with username ${userContext.username}`);

    const imageType = event.queryStringParameters?.imageType;
    const imageSize = parseInt(event.queryStringParameters?.imageSize ?? "0");
    if (!imageType || !ALLOWED_IMAGE_TYPES[imageType]) {
      return generateErrorResponse(400, "Unsupported image type");
    }
    if (imageSize === 0) {
      return generateErrorResponse(400, "Image size must be greater than 0");
    }
    if (imageSize > MAX_IMAGE_SIZE_BYTES) {
      return generateErrorResponse(400, "Image size exceeds limit");
    }

    const extension = ALLOWED_IMAGE_TYPES[imageType];
    const key = `profile-pictures/${userContext.username}-${Date.now()}${extension}`;

    const uploadUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: CDN_BUCKET_NAME,
        Key: key,
        ContentType: imageType
      }),
      {
        expiresIn: 30
      }
    );

    await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: {
        username: userContext.username
      },
      UpdateExpression: "SET profilePictureKey = :key",
      ExpressionAttributeValues: {
        ":key": key
      }
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        uploadUrl: uploadUrl,
        profilePictureKey: key
      }),
      headers: {
        "Content-Type": "application/json"
      }
    };

  } catch (error: any) {
    console.error(error);
    return generateErrorResponse(500, "Internal server error");
  }
}
