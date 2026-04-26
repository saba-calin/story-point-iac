import {
  closeConnection,
  ok,
  RoomQueryResponse,
  RoomStatus,
  sendErrorMessageToConnection, sendToConnection,
  StoryQueryResponse,
  StoryStatus,
  UserContext, VoteQueryResponse
} from "../util";
import {SetActiveStoryRequest} from "./util/SetActiveStoryRequest";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand} from "@aws-sdk/lib-dynamodb";
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
    const setActiveStoryRequest = JSON.parse(event.body) as SetActiveStoryRequest;

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
    if (story.status === StoryStatus.ACTIVE) {
      // no need to broadcast to users since it is already active
      return ok();
    }

    // Fetch the votes for the story, if any
    const queryParams: any = {
      TableName: VOTES_TABLE,
      KeyConditionExpression: "storyId = :storyId",
      ExpressionAttributeValues: {
        ":storyId": story.storyId
      }
    }
    // if (!story.storyEstimation) {
    //   queryParams.ProjectionExpression = "storyId, username";
    // }
    const votesResult = await docClient.send(new QueryCommand(queryParams));
    const votes = votesResult.Items as VoteQueryResponse[] ?? [];

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
    const connections = connectionsResult.Items ?? [];

    const maskedVotes = votes.map(vote => ({ ...vote, voteValue: null }));
    const voteIndexByUsername = new Map(votes.map((vote, i) => [vote.username, i]));

    await Promise.allSettled(
      connections.map(conn => {
        const idx = voteIndexByUsername.get(conn.username);
        const personalVotes = idx !== undefined
          ? [...maskedVotes.slice(0, idx), votes[idx], ...maskedVotes.slice(idx + 1)]
          : maskedVotes;

        return sendToConnection(conn.connectionId, client, {
          action: "storySetActive",
          story: {...story, status: StoryStatus.ACTIVE},
          votes: personalVotes
        });
      })
    );

    return ok();

  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500
    };
  }
}
