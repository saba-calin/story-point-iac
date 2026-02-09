import {SignUpRequest} from "./util/SignUpRequest";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, TransactWriteCommand} from "@aws-sdk/lib-dynamodb";
import {SecretsManagerClient} from "@aws-sdk/client-secrets-manager";
import {generateErrorResponse, getJwtSecret} from "../util";
import * as bcrypt from "bcryptjs";
import * as jwt from "jsonwebtoken";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const secretsClient = new SecretsManagerClient({});

const USERS_TABLE = process.env.USERS_TABLE!;
const USER_EMAILS_TABLE = process.env.USER_EMAILS_TABLE!;
const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN!;
const JWT_EXPIRY_DAYS = Number(process.env.JWT_EXPIRY_DAYS!);

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

    cachedJwtSecret = await getJwtSecret(cachedJwtSecret, JWT_SECRET_ARN, secretsClient);

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(signUpRequest.password, saltRounds);

    const userRecord = {
      username: signUpRequest.username,
      email: signUpRequest.email,
      firstName: signUpRequest.firstName,
      lastName: signUpRequest.lastName,
      password: hashedPassword,
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

    const expirationTime = 60 * 60 * 24 * JWT_EXPIRY_DAYS;
    const jwtToken = jwt.sign(
      {
        username: userRecord.username,
        email: userRecord.email,
        firstName: userRecord.firstName,
        lastName: userRecord.lastName
      },
      cachedJwtSecret,
      {
        expiresIn: expirationTime
      }
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "User created successfully",
        user: {
          username: userRecord.username,
          email: userRecord.email,
          firstName: userRecord.firstName,
          lastName: userRecord.lastName
        }
      }),
      headers: {
        "Content-Type": "application/json"
      },
      cookies: [
        `jwt=${jwtToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${expirationTime}`
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
