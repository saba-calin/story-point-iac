import {SignUpRequest} from "./util/SignUpRequest";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, PutCommand, TransactWriteCommand} from "@aws-sdk/lib-dynamodb";
import {SecretsManagerClient} from "@aws-sdk/client-secrets-manager";
import {generateErrorResponse, getSecret, UserRole} from "../util";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";
import {createHash, randomBytes} from "node:crypto";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({});

const USERS_TABLE = process.env.USERS_TABLE!;
const USER_EMAILS_TABLE = process.env.USER_EMAILS_TABLE!;
const REFRESH_TOKENS_TABLE = process.env.REFRESH_TOKENS_TABLE!;

const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN!;
const ROOT_DOMAIN = process.env.ROOT_DOMAIN!;
const PASSWORD_SALT_ROUNDS = Number(process.env.PASSWORD_SALT_ROUNDS!);

const ACCESS_TOKEN_EXPIRY_MINUTES = Number(process.env.ACCESS_TOKEN_EXPIRY_MINUTES!);
const REFRESH_TOKEN_EXPIRY_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS!);

let cachedJwtSecret: string | null = null;

export async function handler(event: any) {
  try {
    const signUpRequest: SignUpRequest = JSON.parse(event.body);
    console.log("Sign-up request: ", signUpRequest);

    if (!signUpRequest.firstName || !signUpRequest.lastName || !signUpRequest.username || !signUpRequest.email || !signUpRequest.password) {
      return generateErrorResponse(400, "Missing required fields");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(signUpRequest.email)) {
      return generateErrorResponse(400, "Invalid email format");
    }

    if (signUpRequest.password.length < 8) {
      return generateErrorResponse(400, "Password must be at least 8 characters");
    }

    cachedJwtSecret = await getSecret(cachedJwtSecret, JWT_SECRET_ARN, secretsClient);
    const hashedPassword = await bcrypt.hash(signUpRequest.password, PASSWORD_SALT_ROUNDS);

    const userRecord = {
      username: signUpRequest.username,
      email: signUpRequest.email,
      firstName: signUpRequest.firstName,
      lastName: signUpRequest.lastName,
      password: hashedPassword,
      role: UserRole.USER
    };
    const emailRecord = {
      email: signUpRequest.email,
      username: signUpRequest.username
    }

    await docClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: USERS_TABLE,
              Item: userRecord,
              ConditionExpression: "attribute_not_exists(username)"
            }
          },
          {
            Put: {
              TableName: USER_EMAILS_TABLE,
              Item: emailRecord,
              ConditionExpression: "attribute_not_exists(email)"
            }
          }
        ]
      })
    );

    const accessTokenDuration = 60 * ACCESS_TOKEN_EXPIRY_MINUTES;
    const accessToken = jwt.sign(
      {
        username: userRecord.username,
        email: userRecord.email,
        firstName: userRecord.firstName,
        lastName: userRecord.lastName,
        role: userRecord.role
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
        username: userRecord.username,
        createdAt: now,
        expiresAt: now + refreshTokenDuration * 1000,
        ttl: Math.floor(now / 1000) + refreshTokenDuration
      }
    }));

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "User created successfully",
        userContext: {
          username: userRecord.username,
          email: userRecord.email,
          firstName: userRecord.firstName,
          lastName: userRecord.lastName,
          role: userRecord.role,
          accessTokenDuration: accessTokenDuration,
          profilePictureKey: null,
          hasJiraAccess: null
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
    console.error("Signup error: ", error);

    if (error.name === "TransactionCanceledException") {
      const reasons = error.CancellationReasons || [];

      if (reasons[0]?.Code === "ConditionalCheckFailed") {
        return generateErrorResponse(409, "Username already exists");
      }
      if (reasons[1]?.Code === "ConditionalCheckFailed") {
        return generateErrorResponse(409, "Email already exists");
      }
    }

    return generateErrorResponse(500, "Internal server error");
  }
}
