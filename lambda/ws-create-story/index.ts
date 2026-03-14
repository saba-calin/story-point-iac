import {
  closeConnection,
  ok,
  RoomQueryResponse,
  RoomStatus,
  sendErrorMessageToConnection,
  sendToConnection,
  StoryStatus,
  UserContext
} from "../util";
import {CreateStoryRequest} from "./util/CreateStoryRequest";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand} from "@aws-sdk/lib-dynamodb";
import {ApiGatewayManagementApiClient} from "@aws-sdk/client-apigatewaymanagementapi";
import { uuidv7 } from 'uuidv7';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const ROOMS_TABLE = process.env.ROOMS_TABLE!;
const STORIES_TABLE = process.env.STORIES_TABLE!;
const WS_CONNECTIONS_TABLE = process.env.WS_CONNECTIONS_TABLE!;

const WS_CONNECTIONS_TABLE_INDEX = process.env.WS_CONNECTIONS_TABLE_INDEX!;

export async function handler(event: any) {
  try {
    console.log(event);
    const {connectionId, domainName} = event.requestContext;
    const userContext = event.requestContext.authorizer as UserContext;
    const createStoryRequest = JSON.parse(event.body) as CreateStoryRequest;

    const client = new ApiGatewayManagementApiClient({
      endpoint: `https://${domainName}`
    });

    const roomResult = await docClient.send(new GetCommand({
      TableName: ROOMS_TABLE,
      Key: {
        roomId: createStoryRequest.roomId
      }
    }));
    const room = roomResult.Item as RoomQueryResponse;
    if (!room) {
      await sendErrorMessageToConnection(connectionId, `Room with id ${createStoryRequest.roomId} not found`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (room.status === RoomStatus.CLOSED) {
      await sendErrorMessageToConnection(connectionId, `Room with id ${createStoryRequest.roomId} is already closed`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (room.ownerUsername !== userContext.username) {
      await sendErrorMessageToConnection(connectionId, `Only the owner of the room ${createStoryRequest.roomId} can add stories`, client);
      await closeConnection(connectionId, client);
      return ok();
    }

    const storyRecord = {
      roomId: createStoryRequest.roomId,
      storyId: uuidv7(),
      name: createStoryRequest.name,
      description: createStoryRequest.description,
      status: StoryStatus.NON_ACTIVE,
      ...(createStoryRequest.issueKey && {issueKey: createStoryRequest.issueKey})
    }
    await docClient.send(new PutCommand({
      TableName: STORIES_TABLE,
      Item: storyRecord
    }));

    const connectionsResult = await docClient.send(new QueryCommand({
      TableName: WS_CONNECTIONS_TABLE,
      IndexName: WS_CONNECTIONS_TABLE_INDEX,
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: {
        ":roomId": createStoryRequest.roomId
      }
    }));
    const connections = connectionsResult.Items?.map(c => c.connectionId) ?? [];

    const {issueKey, ...storyForBroadcast} = storyRecord;
    await Promise.all(
      connections.map(connectionId => sendToConnection(connectionId, client, {
        action: "storyCreated",
        story: storyForBroadcast
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
