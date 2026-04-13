import {generateErrorResponse, getCookieValue, getSecret, RefreshTokenQueryResponse, UserQueryResponse} from "../util";
import {createHash, randomBytes} from "node:crypto";
import {SecretsManagerClient} from "@aws-sdk/client-secrets-manager";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand} from "@aws-sdk/lib-dynamodb";
import * as jwt from "jsonwebtoken";

const secretsClient = new SecretsManagerClient({});
const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const REFRESH_TOKENS_TABLE = process.env.REFRESH_TOKENS_TABLE!;
const USERS_TABLE = process.env.USERS_TABLE!;
const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN!;
const ROOT_DOMAIN = process.env.ROOT_DOMAIN!;
const ACCESS_TOKEN_EXPIRY_MINUTES = Number(process.env.ACCESS_TOKEN_EXPIRY_MINUTES!);
const REFRESH_TOKEN_EXPIRY_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS!);

let cachedJwtSecret: string | null = null;

export async function handler(event: any) {
  try {
    console.log(event);
    const cookies = event.cookies?.join(";") || "";
    const refreshToken = getCookieValue(cookies, "sp-refresh");

    if (!refreshToken) {
      return generateErrorResponse(401, "No refresh token provided");
    }

    const oldRefreshTokenHash = createHash("sha256").update(refreshToken).digest("hex");
    const tokenResult = await docClient.send(new GetCommand({
      TableName: REFRESH_TOKENS_TABLE,
      Key: {refreshTokenHash: oldRefreshTokenHash}
    }));
    if (!tokenResult.Item) {
      return generateErrorResponse(401, "Invalid refresh token");
    }
    if (tokenResult.Item.expiresAt < Date.now()) {
      return generateErrorResponse(401, "Refresh token expired");
    }
    const oldRefreshToken = tokenResult.Item as RefreshTokenQueryResponse;

    const userResult = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: {username: oldRefreshToken.username}
    }));
    if (!userResult.Item) {
      return generateErrorResponse(401, "User not found");
    }
    const user = userResult.Item as UserQueryResponse;

    cachedJwtSecret = await getSecret(cachedJwtSecret, JWT_SECRET_ARN, secretsClient);
    const accessTokenDuration = 60 * ACCESS_TOKEN_EXPIRY_MINUTES;
    const accessToken = jwt.sign(
      {
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      cachedJwtSecret,
      {
        expiresIn: accessTokenDuration
      }
    );

    const newRefreshToken = randomBytes(64).toString("base64url");
    const newRefreshTokenHash = createHash("sha256").update(newRefreshToken).digest("hex");
    const refreshTokenDuration = 60 * 60 * 24 * REFRESH_TOKEN_EXPIRY_DAYS;

    const now = Date.now();
    await docClient.send(new DeleteCommand({
      TableName: REFRESH_TOKENS_TABLE,
      Key: {refreshTokenHash: oldRefreshTokenHash}
    }));

    await docClient.send(new PutCommand({
      TableName: REFRESH_TOKENS_TABLE,
      Item: {
        refreshTokenHash: newRefreshTokenHash,
        username: user.username,
        createdAt: now,
        expiresAt: now + refreshTokenDuration * 1000,
        ttl: Math.floor(now / 1000) + refreshTokenDuration
      }
    }));

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Token refreshed successfully",
        userContext: {
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          accessTokenDuration: accessTokenDuration,
          profilePictureKey: user.profilePictureKey,
          ...((user.jiraBaseUrl && user.jiraEmail && user.jiraToken && user.storyPointsFieldId) && {hasJiraAccess: true})
        }
      }),
      headers: {
        "Content-Type": "application/json"
      },
      cookies: [
        `sp-access=${accessToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${accessTokenDuration}; Domain=.${ROOT_DOMAIN}`,
        `sp-refresh=${newRefreshToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${refreshTokenDuration}; Domain=.${ROOT_DOMAIN}`
        // `sp-access=${accessToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${accessTokenDuration}; Domain=.${ROOT_DOMAIN}`,
        // `sp-refresh=${newRefreshToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${refreshTokenDuration}; Domain=.${ROOT_DOMAIN}`
      ]
    };

  } catch (error: any) {
    console.error(error);
    return generateErrorResponse(500, "Internal server error");
  }
}
