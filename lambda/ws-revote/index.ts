import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import {
  closeConnection, ok, RoomQueryResponse, RoomStatus, sendErrorMessageToConnection, sendToConnection,
  StoryQueryResponse, StoryStatus, UserContext, VoteQueryResponse
} from "../util";
import {RevoteRequest} from "./util/RevoteRequest";
import {ApiGatewayManagementApiClient} from "@aws-sdk/client-apigatewaymanagementapi";
import {NodeHttpHandler} from "@smithy/node-http-handler";
import {Agent} from "https";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const ROOMS_TABLE = process.env.ROOMS_TABLE!;
const STORIES_TABLE = process.env.STORIES_TABLE!;
const VOTES_TABLE = process.env.VOTES_TABLE!;
const WS_CONNECTIONS_TABLE = process.env.WS_CONNECTIONS_TABLE!;
const WS_CONNECTIONS_TABLE_INDEX = process.env.WS_CONNECTIONS_TABLE_INDEX!;

const httpsAgent = new Agent({keepAlive: true, maxSockets: Infinity});
let apiGwClient: ApiGatewayManagementApiClient;

export async function handler(event: any) {
  try {
    // console.log(event);
    const {connectionId, domainName} = event.requestContext;
    const userContext = event.requestContext.authorizer as UserContext;
    const revoteRequest = JSON.parse(event.body) as RevoteRequest;

    if (!apiGwClient) {
      apiGwClient = new ApiGatewayManagementApiClient({
        endpoint: `https://${domainName}`,
        requestHandler: new NodeHttpHandler({httpsAgent})
      });
    }
    const client = apiGwClient;

    const roomResult = await docClient.send(new GetCommand({
      TableName: ROOMS_TABLE,
      Key: {
        roomId: revoteRequest.roomId
      }
    }));
    const room = roomResult.Item as RoomQueryResponse;
    if (!room) {
      await sendErrorMessageToConnection(connectionId, `Room with id ${revoteRequest.roomId} not found`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (room.status === RoomStatus.CLOSED) {
      await sendErrorMessageToConnection(connectionId, `Room with id ${revoteRequest.roomId} is already closed`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (room.ownerUsername !== userContext.username) {
      await sendErrorMessageToConnection(connectionId, `Only the owner of the room ${revoteRequest.roomId} can set the story as active`, client);
      await closeConnection(connectionId, client);
      return ok();
    }

    const storyResult = await docClient.send(new GetCommand({
      TableName: STORIES_TABLE,
      Key: {
        roomId: revoteRequest.roomId,
        storyId: revoteRequest.storyId
      }
    }));
    const story = storyResult.Item as StoryQueryResponse;
    if (!story) {
      await sendErrorMessageToConnection(connectionId, `Story with id ${revoteRequest.storyId} not found for room id ${revoteRequest.roomId}`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (story.status !== StoryStatus.ACTIVE) {
      await sendErrorMessageToConnection(connectionId, `Story with id ${revoteRequest.storyId} must first be set to ACTIVE`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (!story.storyEstimation) {
      await sendErrorMessageToConnection(connectionId, `Story with id ${revoteRequest.storyId} must first be estimated`, client);
      await closeConnection(connectionId, client);
      return ok();
    }

    // batch delete all votes for the story
    const votesResult = await docClient.send(new QueryCommand({
      TableName: VOTES_TABLE,
      KeyConditionExpression: "storyId = :storyId",
      ExpressionAttributeValues: {
        ":storyId": revoteRequest.storyId
      }
    }));
    const votes = votesResult.Items as VoteQueryResponse[] ?? [];
    if (votes.length > 0) {
      const deleteRequests = votes.map(vote => ({
        DeleteRequest: {
          Key: {
            storyId: vote.storyId,
            username: vote.username
          }
        }
      }));

      for (let i = 0; i < deleteRequests.length; i += 25) {
        await docClient.send(new BatchWriteCommand({
          RequestItems: {
            [VOTES_TABLE]: deleteRequests.slice(i, i + 25)
          }
        }));
      }
    }

    // delete the story estimation
    await docClient.send(new UpdateCommand({
      TableName: STORIES_TABLE,
      Key: {
        roomId: revoteRequest.roomId,
        storyId: revoteRequest.storyId
      },
      UpdateExpression: "REMOVE storyEstimation"
    }));

    const connectionsResult = await docClient.send(new QueryCommand({
      TableName: WS_CONNECTIONS_TABLE,
      IndexName: WS_CONNECTIONS_TABLE_INDEX,
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: {
        ":roomId": revoteRequest.roomId
      }
    }));
    const connections = connectionsResult.Items?.map(c => c.connectionId) ?? [];

    await Promise.allSettled(
      connections.map(connectionId => sendToConnection(connectionId, client, {
        action: "storyRevote",
        story: {
          ...story,
          storyEstimation: null
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
