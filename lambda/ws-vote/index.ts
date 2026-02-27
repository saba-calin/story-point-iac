import {
  closeConnection, ok, RoomQueryResponse, RoomStatus, sendErrorMessageToConnection, sendToConnection,
  StoryQueryResponse, StoryStatus, UserContext, VALID_VOTES
} from "../util";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand} from "@aws-sdk/lib-dynamodb";
import {ApiGatewayManagementApiClient} from "@aws-sdk/client-apigatewaymanagementapi";
import {VoteRequest} from "./util/VoteRequest";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const ROOMS_TABLE = process.env.ROOMS_TABLE!;
const STORIES_TABLE = process.env.STORIES_TABLE!;
const VOTES_TABLE = process.env.VOTES_TABLE!;
const ROOM_PARTICIPANTS_TABLE = process.env.ROOM_PARTICIPANTS_TABLE!;
const WS_CONNECTIONS_TABLE = process.env.WS_CONNECTIONS_TABLE!;

const WS_CONNECTIONS_TABLE_INDEX = process.env.WS_CONNECTIONS_TABLE_INDEX!;

export async function handler(event: any) {
  try {
    console.log(event);
    const {connectionId, domainName} = event.requestContext;
    const userContext = event.requestContext.authorizer as UserContext;
    const voteRequest = JSON.parse(event.body) as VoteRequest;

    const client = new ApiGatewayManagementApiClient({
      endpoint: `https://${domainName}`
    });

    if (!VALID_VOTES.includes(voteRequest.voteValue)) {
      await sendErrorMessageToConnection(connectionId, `Invalid vote value`, client);
      await closeConnection(connectionId, client);
      return ok();
    }

    const roomResult = await docClient.send(new GetCommand({
      TableName: ROOMS_TABLE,
      Key: {
        roomId: voteRequest.roomId
      }
    }));
    const room = roomResult.Item as RoomQueryResponse;
    if (!room) {
      await sendErrorMessageToConnection(connectionId, `Room with id ${voteRequest.roomId} not found`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (room.status === RoomStatus.CLOSED) {
      await sendErrorMessageToConnection(connectionId, `Room with id ${voteRequest.roomId} is already closed`, client);
      await closeConnection(connectionId, client);
      return ok();
    }

    const storyResult = await docClient.send(new GetCommand({
      TableName: STORIES_TABLE,
      Key: {
        roomId: voteRequest.roomId,
        storyId: voteRequest.storyId
      }
    }));
    const story = storyResult.Item as StoryQueryResponse;
    if (!story) {
      await sendErrorMessageToConnection(connectionId, `Story with id ${voteRequest.storyId} not found for room id ${voteRequest.roomId}`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (story.status === StoryStatus.NON_ACTIVE) {
      await sendErrorMessageToConnection(connectionId, `Story with id ${voteRequest.storyId} must be set to active in order to vote`, client);
      await closeConnection(connectionId, client);
      return ok();
    }

    const roomParticipantsResult = await docClient.send(new GetCommand({
      TableName: ROOM_PARTICIPANTS_TABLE,
      Key: {
        roomId: voteRequest.roomId,
        username: userContext.username
      }
    }));
    if (!roomParticipantsResult.Item) {
      await sendErrorMessageToConnection(connectionId, `You are not a participant of the room with id ${voteRequest.roomId}`, client);
      await closeConnection(connectionId, client);
      return ok();
    }

    await docClient.send(new UpdateCommand({
      TableName: VOTES_TABLE,
      Key: {
        storyId: voteRequest.storyId,
        username: userContext.username
      },
      UpdateExpression: "SET #v = :voteValue",
      ExpressionAttributeNames: {
        "#v": "voteValue"
      },
      ExpressionAttributeValues: {
        ":voteValue": voteRequest.voteValue
      }
    }));

    const connectionsResult = await docClient.send(new QueryCommand({
      TableName: WS_CONNECTIONS_TABLE,
      IndexName: WS_CONNECTIONS_TABLE_INDEX,
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: {
        ":roomId": voteRequest.roomId
      }
    }));
    const connections = connectionsResult.Items?.map(c => c.connectionId) ?? [];

    await Promise.all(
      connections.map(connectionId => sendToConnection(connectionId, client, {
        action: "playerVoted",
        vote: {
          roomId: voteRequest.roomId,
          storyId: voteRequest.storyId,
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
