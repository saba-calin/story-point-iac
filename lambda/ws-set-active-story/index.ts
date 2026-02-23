import {
  closeConnection,
  ok,
  RoomQueryResponse,
  RoomStatus,
  sendErrorMessageToConnection, sendToConnection,
  StoryQueryResponse,
  StoryStatus,
  UserContext
} from "../util";
import {SetActiveStoryRequest} from "./util/SetActiveStoryRequest";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand} from "@aws-sdk/lib-dynamodb";
import {ApiGatewayManagementApiClient} from "@aws-sdk/client-apigatewaymanagementapi";

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
    const setActiveStoryRequest = JSON.parse(event.body) as SetActiveStoryRequest;

    const client = new ApiGatewayManagementApiClient({
      endpoint: `https://${domainName}`
    });

    const roomResult = await docClient.send(new GetCommand({
      TableName: ROOMS_TABLE,
      Key: {
        roomId: setActiveStoryRequest.roomId
      }
    }));
    const room = roomResult.Item as RoomQueryResponse;
    if (!room) {
      await sendErrorMessageToConnection(connectionId, `Room with id ${setActiveStoryRequest.roomId} not found`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (room.status === RoomStatus.CLOSED) {
      await sendErrorMessageToConnection(connectionId, `Room with id ${setActiveStoryRequest.roomId} is already closed`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (room.ownerUsername !== userContext.username) {
      await sendErrorMessageToConnection(connectionId, `Only the owner of the room ${setActiveStoryRequest.roomId} can set the story as active`, client);
      await closeConnection(connectionId, client);
      return ok();
    }

    const storyResult = await docClient.send(new GetCommand({
      TableName: STORIES_TABLE,
      Key: {
        roomId: setActiveStoryRequest.roomId,
        storyId: setActiveStoryRequest.storyId
      }
    }));
    const story = storyResult.Item as StoryQueryResponse;
    if (!story) {
      await sendErrorMessageToConnection(connectionId, `Story with id ${setActiveStoryRequest.storyId} not found for room id ${setActiveStoryRequest.roomId}`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (story.status == StoryStatus.ACTIVE) {
      // no need to broadcast to users since it is already active
      return ok();
    }

    const activeStoryResult = await docClient.send(new QueryCommand({
      TableName: STORIES_TABLE,
      KeyConditionExpression: "roomId = :roomId",
      FilterExpression: "#s = :storyStatus",
      ExpressionAttributeNames: {
        "#s": "status"
      },
      ExpressionAttributeValues: {
        ":roomId": setActiveStoryRequest.roomId,
        ":storyStatus": StoryStatus.ACTIVE
      }
    }));
    const prevActiveStory = activeStoryResult.Items?.[0] as StoryQueryResponse ?? null;

    const updates: Promise<any>[] = [];

    if (prevActiveStory) {
      updates.push(
        docClient.send(new UpdateCommand({
          TableName: STORIES_TABLE,
          Key: {
            roomId: prevActiveStory.roomId,
            storyId: prevActiveStory.storyId
          },
          UpdateExpression: "SET #s = :nonActiveStatus",
          ExpressionAttributeNames: {
            "#s": "status"
          },
          ExpressionAttributeValues: {
            ":nonActiveStatus": StoryStatus.NON_ACTIVE
          }
        }))
      );
    }

    updates.push(
      docClient.send(new UpdateCommand({
        TableName: STORIES_TABLE,
        Key: {
          roomId: setActiveStoryRequest.roomId,
          storyId: setActiveStoryRequest.storyId
        },
        UpdateExpression: "SET #s = :activeStatus",
        ExpressionAttributeNames: {
          "#s": "status"
        },
        ExpressionAttributeValues: {
          ":activeStatus": StoryStatus.ACTIVE
        }
      }))
    );

    await Promise.all(updates);

    const connectionsResult = await docClient.send(new QueryCommand({
      TableName: WS_CONNECTIONS_TABLE,
      IndexName: WS_CONNECTIONS_TABLE_INDEX,
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: {
        ":roomId": setActiveStoryRequest.roomId
      }
    }));
    const connections = connectionsResult.Items?.map(c => c.connectionId) ?? [];

    await Promise.all(
      connections.map(connectionId => sendToConnection(connectionId, client, {
        action: "storySetActive",
        story: {
          ...story,
          status: StoryStatus.ACTIVE
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
