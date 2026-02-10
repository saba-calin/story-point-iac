import {generateErrorResponse, UserContext, UserQueryResponse} from "../util";
import {DynamoDBDocumentClient, GetCommand, UpdateCommand} from "@aws-sdk/lib-dynamodb";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {PasswordChangeRequest} from "./util/PasswordChangeRequest";
import * as bcrypt from "bcryptjs";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const USERS_TABLE = process.env.USERS_TABLE!;
const PASSWORD_SALT_ROUNDS = Number(process.env.PASSWORD_SALT_ROUNDS!);

export async function handler(event: any) {
  try {
    const userContext = event.requestContext.authorizer.lambda as UserContext;
    console.log("Password change for user: ", userContext.username);

    const passwordChangeRequest = JSON.parse(event.body) as PasswordChangeRequest;
    if (!passwordChangeRequest.currentPassword || !passwordChangeRequest.newPassword) {
      return generateErrorResponse(400, "Missing required fields");
    }
    if (passwordChangeRequest.newPassword.length < 8) {
      return generateErrorResponse(400, "The new password must be at least 8 characters");
    }
    if (passwordChangeRequest.currentPassword === passwordChangeRequest.newPassword) {
      return generateErrorResponse(400, "The new password must be different from the current one");
    }

    const result = await docClient.send(
      new GetCommand({
        TableName: USERS_TABLE,
        Key: {username: userContext.username}
      })
    )
    if (!result.Item) {
      return generateErrorResponse(400, "Invalid username");
    }

    const user = result.Item as UserQueryResponse;

    const passwordMatches = await bcrypt.compare(passwordChangeRequest.currentPassword, user.password);
    if (!passwordMatches) {
      return generateErrorResponse(400, "The current password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(passwordChangeRequest.newPassword, PASSWORD_SALT_ROUNDS);
    await docClient.send(
      new UpdateCommand({
        TableName: USERS_TABLE,
        Key: {username: userContext.username},
        UpdateExpression: "SET password = :password",
        ExpressionAttributeValues: {
          ":password": hashedPassword
        }
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Password updated successfully"
      }),
      headers: {
        "Content-Type": "application/json"
      }
    };

  } catch (error: any) {
    console.error("Password change error: ", error);
    return generateErrorResponse(500, "Internal server error");
  }
}
