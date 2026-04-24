import {generateErrorResponse, RoomQueryResponse, UserContext, UserRole} from "../util";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, QueryCommand, ScanCommand} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const ROOMS_TABLE = process.env.ROOMS_TABLE!;
const ROOM_PARTICIPANTS_TABLE = process.env.ROOM_PARTICIPANTS_TABLE!;
const ROOM_PARTICIPANTS_TABLE_INDEX = process.env.ROOM_PARTICIPANTS_TABLE_INDEX!;

const ROOMS_PAGE_SIZE = parseInt(process.env.ROOMS_PAGE_SIZE!);

export async function handler(event: any) {
  try {
    console.log(event);
    const userContext = event.requestContext.authorizer.lambda as UserContext;
    const userRole = userContext.role;

    const nextToken = event.queryStringParameters?.nextToken;
    const limit = parseInt(event.queryStringParameters?.limit) || ROOMS_PAGE_SIZE;
    let exclusiveStartKey;

    if (nextToken) {
      try {
        exclusiveStartKey = JSON.parse(Buffer.from(nextToken, "base64").toString());
      } catch (error: any) {
        console.error(error);
        return generateErrorResponse(400, "Invalid pagination token");
      }
    }

    let roomsResult;
    if (userRole === UserRole.ADMIN) {
      const scanParams: any = {
        TableName: ROOMS_TABLE,
        Limit: limit
      };
      if (exclusiveStartKey) {
        scanParams.ExclusiveStartKey = exclusiveStartKey;
      }
      roomsResult = await docClient.send(new ScanCommand(scanParams));
    } else {
      const queryParams: any = {
        TableName: ROOM_PARTICIPANTS_TABLE,
        IndexName: ROOM_PARTICIPANTS_TABLE_INDEX,
        KeyConditionExpression: "username = :username",
        ExpressionAttributeValues: {
          ":username": userContext.username
        },
        ScanIndexForward: false,
        Limit: limit
      };
      if (exclusiveStartKey) {
        queryParams.ExclusiveStartKey = exclusiveStartKey;
      }
      roomsResult = await docClient.send(new QueryCommand(queryParams));
    }
    const rooms = roomsResult.Items as RoomQueryResponse[] ?? [];

    const lastEvaluatedKey = roomsResult.LastEvaluatedKey;
    return {
      statusCode: 200,
      body: JSON.stringify({
        rooms: rooms,
        hasMore: !!roomsResult.LastEvaluatedKey,
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
