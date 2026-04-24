import {generateErrorResponse, UserContext} from "../util";
import {BanUserRequest} from "./util/BanUserRequest";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {BatchWriteCommand, DynamoDBDocumentClient, QueryCommand, UpdateCommand} from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const USERS_TABLE = process.env.USERS_TABLE!;
const REFRESH_TOKENS_TABLE = process.env.REFRESH_TOKENS_TABLE!;
const REFRESH_TOKENS_TABLE_INDEX = process.env.REFRESH_TOKENS_TABLE_INDEX!;

export async function handler(event: any) {
  try {
    console.log(event);
    const userContext = event.requestContext.authorizer.lambda as UserContext;

    const banUserRequest = JSON.parse(event.body) as BanUserRequest;
    if (!banUserRequest.username) {
      return generateErrorResponse(400, "Missing required fields");
    }
    if (banUserRequest.username === userContext.username) {
      return generateErrorResponse(400, "Cannot ban yourself");
    }

    await docClient.send(
      new UpdateCommand({
        TableName: USERS_TABLE,
        Key: {username: banUserRequest.username},
        UpdateExpression: "SET isBanned = :isBanned",
        ConditionExpression: "attribute_exists(username) AND (attribute_not_exists(isBanned) OR isBanned = :false) AND #r <> :admin",
        ExpressionAttributeNames: {
          "#r": "role"
        },
        ExpressionAttributeValues: {
          ":isBanned": true,
          ":false": false,
          ":admin": "admin"
        },
        ReturnValuesOnConditionCheckFailure: "ALL_OLD"
      })
    );

    const tokensResult = await docClient.send(new QueryCommand({
      TableName: REFRESH_TOKENS_TABLE,
      IndexName: REFRESH_TOKENS_TABLE_INDEX,
      KeyConditionExpression: "username = :username",
      ExpressionAttributeValues: {
        ":username": banUserRequest.username
      }
    }));

    if (tokensResult.Items && tokensResult.Items.length > 0) {
      const deleteRequests = tokensResult.Items.map(item => ({
        DeleteRequest: {
          Key: {refreshTokenHash: item.refreshTokenHash}
        }
      }));

      for (let i = 0; i < deleteRequests.length; i += 25) {
        await docClient.send(new BatchWriteCommand({
          RequestItems: {
            [REFRESH_TOKENS_TABLE]: deleteRequests.slice(i, i + 25)
          }
        }));
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "User banned successfully"
      }),
      headers: {
        "Content-Type": "application/json"
      }
    };

  } catch (error: any) {
    if (error.name === "ConditionalCheckFailedException") {
      if (!error.Item) {
        return generateErrorResponse(404, "User not found");
      }
      if (error.Item.role?.S === "admin") {
        return generateErrorResponse(400, "Cannot ban an admin");
      }
      return generateErrorResponse(400, "User is already banned");
    }
    console.error(error);
    return generateErrorResponse(500, "Internal server error");
  }
}
