import {generateErrorResponse, RoomStatus, UserContext} from "../util";
import {CreateRoomRequest} from "./util/CreateRoomRequest";
import {randomUUID} from "node:crypto";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, PutCommand} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const ROOMS_TABLE = process.env.ROOMS_TABLE!;

export async function handler(event: any) {
  try {
    const userContext = event.requestContext.authorizer.lambda as UserContext;
    console.log("Room creation for user: ", userContext.username);

    const createRoomRequest = JSON.parse(event.body) as CreateRoomRequest;
    if (!createRoomRequest.name) {
      return generateErrorResponse(400, "Missing required fields");
    }

    const roomId = randomUUID();
    const createdAt = Date.now();

    const roomRecord = {
      roomId: roomId,
      name: createRoomRequest.name,
      ownerUsername: userContext.username,
      createdAt: createdAt,
      status: RoomStatus.OPEN
    };

    await docClient.send(
      new PutCommand({
        TableName: ROOMS_TABLE,
        Item: roomRecord
      })
    );

    return {
      statusCode: 201,
      body: JSON.stringify(roomRecord),
      headers: {
        "Content-Type": "application/json"
      }
    };

  } catch (error: any) {
    console.error(error);
    return generateErrorResponse(500, "Internal server error");
  }
}
