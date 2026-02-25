import {JoinRoomRequest} from "./util/JoinRoomRequest";
import {
  closeConnection,
  ok,
  RoomQueryResponse,
  RoomStatus,
  sendErrorMessageToConnection, sendToConnection,
  UserContext
} from "../util";
import {ApiGatewayManagementApiClient} from "@aws-sdk/client-apigatewaymanagementapi";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand} from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const ROOMS_TABLE = process.env.ROOMS_TABLE!;
const WS_CONNECTIONS_TABLE = process.env.WS_CONNECTIONS_TABLE!;
const ROOM_PARTICIPANTS_TABLE = process.env.ROOM_PARTICIPANTS_TABLE!;
const STORIES_TABLE = process.env.STORIES_TABLE!;

const WS_CONNECTIONS_TABLE_INDEX = process.env.WS_CONNECTIONS_TABLE_INDEX!;

export async function handler(event: any) {
  try {
    console.log(event);
    const {connectionId, domainName} = event.requestContext;
    const userContext = event.requestContext.authorizer as UserContext;
    const joinRoomRequest = JSON.parse(event.body) as JoinRoomRequest;

    const client = new ApiGatewayManagementApiClient({
      endpoint: `https://${domainName}`
    });

    if (!joinRoomRequest.roomId) {
      await sendErrorMessageToConnection(connectionId, "Missing room id", client);
      await closeConnection(connectionId, client);
      return ok();
    }

    // Check if room exists and is open
    const roomResult = await docClient.send(new GetCommand({
      TableName: ROOMS_TABLE,
      Key: {
        roomId: joinRoomRequest.roomId
      }
    }));
    const room = roomResult.Item as RoomQueryResponse;
    if (!room) {
      await sendErrorMessageToConnection(connectionId, `Room with id ${joinRoomRequest.roomId} not found`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (room.status === RoomStatus.CLOSED) {
      await sendErrorMessageToConnection(connectionId, `Room with id ${joinRoomRequest.roomId} is already closed`, client);
      await closeConnection(connectionId, client);
      return ok();
    }

    // Store connection
    const joinTime = Date.now();
    await docClient.send(new PutCommand({
      TableName: WS_CONNECTIONS_TABLE,
      Item: {
        connectionId: connectionId,
        roomId: joinRoomRequest.roomId,
        username: userContext.username,
        joinedAt: joinTime
      }
    }));

    // Store participant
    await docClient.send(new PutCommand({
      TableName: ROOM_PARTICIPANTS_TABLE,
      Item: {
        roomId: joinRoomRequest.roomId,
        username: userContext.username,
        joinedAt: joinTime
      }
    }));

    // Fetch all participants
    const participantsResult = await docClient.send(new QueryCommand({
      TableName: ROOM_PARTICIPANTS_TABLE,
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: {
        ":roomId": joinRoomRequest.roomId
      }
    }));
    const players = participantsResult.Items?.map(p => p.username) ?? [];

    // Fetch all stories
    const storiesResult = await docClient.send(new QueryCommand({
      TableName: STORIES_TABLE,
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: {
        ":roomId": joinRoomRequest.roomId,
      }
    }));
    const stories = storiesResult.Items ?? [];
    console.log("Stories", stories);

    // Fetch all active connections in the room
    const connectionsResult = await docClient.send(new QueryCommand({
      TableName: WS_CONNECTIONS_TABLE,
      IndexName: WS_CONNECTIONS_TABLE_INDEX,
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: {
        ":roomId": joinRoomRequest.roomId
      }
    }));
    const connections = connectionsResult.Items ?? [];

    // Send the room state to the joining client
    await sendToConnection(connectionId, client, {
      action: "roomJoined",
      room: room,
      players: players,
      stories: stories
    });

    await Promise.all(
      connections
        .filter(c => c.connectionId !== connectionId)
        .map(c => sendToConnection(c.connectionId, client, {
          action: "playerJoined",
          player: {
            username: userContext.username
          }
        }))
    );

    return ok();

  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500
    };
  }
}
