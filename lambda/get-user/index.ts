import {generateErrorResponse, UserContext, UserQueryResponse, UserRole} from "../util";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, ScanCommand} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.USERS_TABLE!;
const USERS_PAGE_SIZE = parseInt(process.env.USERS_PAGE_SIZE!);

export async function handler(event: any) {
  try {
    console.log(event);

    const nextToken = event.queryStringParameters?.nextToken;
    const limit = parseInt(event.queryStringParameters?.limit) || USERS_PAGE_SIZE;
    let exclusiveStartKey;

    if (nextToken) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(nextToken, "base64").toString());
      } catch (error: any) {
        console.error(error);
        return generateErrorResponse(400, "Invalid pagination token");
      }
    }

    const scanParams: any = {
      TableName: USERS_TABLE,
      ProjectionExpression: "username, email, firstName, lastName, #r, profilePictureKey, isBanned",
      ExpressionAttributeNames: {
        "#r": "role"
      },
      Limit: limit
    };
    if (exclusiveStartKey) {
      scanParams.ExclusiveStartKey = exclusiveStartKey;
    }

    const usersResult = await docClient.send(new ScanCommand(scanParams));
    const users = usersResult.Items ?? [] as UserQueryResponse[];

    const lastEvaluatedKey = usersResult.LastEvaluatedKey;
    return {
      statusCode: 200,
      body: JSON.stringify({
        users: users,
        hasMore: !!usersResult.LastEvaluatedKey,
        ...(lastEvaluatedKey && {nextToken: Buffer.from(JSON.stringify(lastEvaluatedKey)).toString("base64")})
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
