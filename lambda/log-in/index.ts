import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {SecretsManagerClient} from "@aws-sdk/client-secrets-manager";
import {DynamoDBDocumentClient, GetCommand, PutCommand} from "@aws-sdk/lib-dynamodb";
import {LogInRequest} from "./util/LogInRequest";
import {generateErrorResponse, getSecret, UserQueryResponse} from "../util";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import {createHash, randomBytes} from "node:crypto";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({});

const USERS_TABLE = process.env.USERS_TABLE!;
const REFRESH_TOKENS_TABLE = process.env.REFRESH_TOKENS_TABLE!;

const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN!;
const ROOT_DOMAIN = process.env.ROOT_DOMAIN!;

const ACCESS_TOKEN_EXPIRY_MINUTES = Number(process.env.ACCESS_TOKEN_EXPIRY_MINUTES!);
const REFRESH_TOKEN_EXPIRY_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS!);

let cachedJwtSecret: string | null = null;

export async function handler(event: any) {
  try {
    const logInRequest: LogInRequest = JSON.parse(event.body);
    console.log("Log-in request for user: ", logInRequest.username);

    if (!logInRequest.username || !logInRequest.password) {
      return generateErrorResponse(400, "Missing required fields");
    }

    const result = await docClient.send(
      new GetCommand({
        TableName: USERS_TABLE,
        Key: {username: logInRequest.username}
      })
    );
    if (!result.Item) {
      return generateErrorResponse(400, "Invalid credentials");
    }

    const user = result.Item as UserQueryResponse;
    if (user.isBanned) {
      return generateErrorResponse(400, "Account is banned");
    }

    const passwordMatches = await bcrypt.compare(logInRequest.password, user.password);
    if (!passwordMatches) {
      return generateErrorResponse(400, "Invalid credentials");
    }

    cachedJwtSecret = await getSecret(cachedJwtSecret, JWT_SECRET_ARN, secretsClient);
    const accessTokenDuration = 60 * ACCESS_TOKEN_EXPIRY_MINUTES;
    const accessToken = jwt.sign(
      {
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      cachedJwtSecret,
      {
        expiresIn: accessTokenDuration
      }
    );

    const refreshToken = randomBytes(64).toString("base64url");
    const refreshTokenHash = createHash("sha256").update(refreshToken).digest("hex");
    const refreshTokenDuration = 60 * 60 * 24 * REFRESH_TOKEN_EXPIRY_DAYS;

    const now = Date.now();
    await docClient.send(new PutCommand({
      TableName: REFRESH_TOKENS_TABLE,
      Item: {
        refreshTokenHash,
        username: user.username,
        createdAt: now,
        expiresAt: now + refreshTokenDuration * 1000,
        ttl: Math.floor(now / 1000) + refreshTokenDuration
      }
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Logged in successfully",
        userContext: {
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          accessTokenDuration: accessTokenDuration,
          profilePictureKey: user.profilePictureKey ?? null,
          hasJiraAccess: (user.jiraBaseUrl && user.jiraEmail && user.jiraToken && user.storyPointsFieldId) ? true : null
        }
      }),
      headers: {
        "Content-Type": "application/json"
      },
      cookies: [
        `sp-access=${accessToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${accessTokenDuration}; Domain=.${ROOT_DOMAIN}`,
        `sp-refresh=${refreshToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${refreshTokenDuration}; Domain=.${ROOT_DOMAIN}`
        // `sp-access=${accessToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${accessTokenDuration}; Domain=.${ROOT_DOMAIN}`,
        // `sp-refresh=${refreshToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${refreshTokenDuration}; Domain=.${ROOT_DOMAIN}`
      ]
    };

  } catch (error: any) {
    console.error(error);
    return generateErrorResponse(500, "Internal server error");
  }
}
