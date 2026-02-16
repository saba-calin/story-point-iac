import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {SecretsManagerClient} from "@aws-sdk/client-secrets-manager";
import {DynamoDBDocumentClient, GetCommand} from "@aws-sdk/lib-dynamodb";
import {LogInRequest} from "./util/LogInRequest";
import {generateErrorResponse, getJwtSecret, UserQueryResponse} from "../util";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({});

const USERS_TABLE = process.env.USERS_TABLE!;
const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN!;
const JWT_EXPIRY_DAYS = Number(process.env.JWT_EXPIRY_DAYS!);
const ROOT_DOMAIN = process.env.ROOT_DOMAIN!;

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

    const passwordMatches = await bcrypt.compare(logInRequest.password, user.password);
    if (!passwordMatches) {
      return generateErrorResponse(400, "Invalid credentials");
    }

    cachedJwtSecret = await getJwtSecret(cachedJwtSecret, JWT_SECRET_ARN, secretsClient);
    const expirationTime = 60 * 60 * 24 * JWT_EXPIRY_DAYS;

    const jwtToken = jwt.sign(
      {
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      cachedJwtSecret,
      {
        expiresIn: expirationTime
      }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Logged in successfully",
        user: {
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        }
      }),
      headers: {
        "Content-Type": "application/json"
      },
      cookies: [
        `jwt=${jwtToken}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${expirationTime}; Domain=.${ROOT_DOMAIN}`
        // `jwt=${jwtToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${expirationTime}; Domain=.${ROOT_DOMAIN}`
      ]
    };

  } catch (error: any) {
    console.error(error);
    return generateErrorResponse(500, "Internal server error");
  }
}
