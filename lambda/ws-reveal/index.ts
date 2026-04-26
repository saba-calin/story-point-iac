import {
  closeConnection, ok, RoomQueryResponse, RoomStatus, sendErrorMessageToConnection, sendToConnection,
  StoryQueryResponse, StoryStatus, UserContext, UserQueryResponse, VALID_ESTIMATES, VoteQueryResponse
} from "../util";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand} from "@aws-sdk/lib-dynamodb";
import {RevealRequest} from "./util/RevealRequest";
import {ApiGatewayManagementApiClient} from "@aws-sdk/client-apigatewaymanagementapi";
import {NodeHttpHandler} from "@smithy/node-http-handler";
import {Agent} from "https";
import {DecryptCommand, KMSClient} from "@aws-sdk/client-kms";
import axios from "axios";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const kmsClient = new KMSClient({});

const USERS_TABLE = process.env.USERS_TABLE;
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
    const revealRequest = JSON.parse(event.body) as RevealRequest;

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
        roomId: revealRequest.roomId
      }
    }));
    const room = roomResult.Item as RoomQueryResponse;
    if (!room) {
      await sendErrorMessageToConnection(connectionId, `Room with id ${revealRequest.roomId} not found`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (room.status === RoomStatus.CLOSED) {
      await sendErrorMessageToConnection(connectionId, `Room with id ${revealRequest.roomId} is already closed`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (room.ownerUsername !== userContext.username) {
      await sendErrorMessageToConnection(connectionId, `Only the owner of the room ${revealRequest.roomId} can reveal the cards`, client);
      await closeConnection(connectionId, client);
      return ok();
    }

    const storyResult = await docClient.send(new GetCommand({
      TableName: STORIES_TABLE,
      Key: {
        roomId: revealRequest.roomId,
        storyId: revealRequest.storyId
      }
    }));
    const story = storyResult.Item as StoryQueryResponse;
    if (!story) {
      await sendErrorMessageToConnection(connectionId, `Story with id ${revealRequest.storyId} not found for room id ${revealRequest.roomId}`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (story.status === StoryStatus.NON_ACTIVE) {
      await sendErrorMessageToConnection(connectionId, `Story with id ${revealRequest.storyId} must be set to active in order to reveal votes`, client);
      await closeConnection(connectionId, client);
      return ok();
    }
    if (story.storyEstimation) {
      await sendErrorMessageToConnection(connectionId, `Story with id ${revealRequest.storyId} has already been estimated`, client);
      await closeConnection(connectionId, client);
      return ok();
    }

    const votesResult = await docClient.send(new QueryCommand({
      TableName: VOTES_TABLE,
      KeyConditionExpression: "storyId = :storyId",
      ExpressionAttributeValues: {
        ":storyId": revealRequest.storyId
      }
    }));
    const votes = votesResult.Items as VoteQueryResponse[] ?? [];

    const storyEstimation = computeStoryEstimationValue(votes);
    const storyEstimationRounded = roundStoryEstimation(storyEstimation);
    await docClient.send(new UpdateCommand({
      TableName: STORIES_TABLE,
      Key: {
        roomId: revealRequest.roomId,
        storyId: revealRequest.storyId
      },
      UpdateExpression: "SET storyEstimation = :storyEstimation",
      ExpressionAttributeValues: {
        ":storyEstimation": storyEstimationRounded
      }
    }));

    if (story.issueKey) {
      const userResponse = await docClient.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: {
          username: userContext.username
        }
      }));
      const user = userResponse.Item as UserQueryResponse;

      if (user.jiraToken && user.jiraEmail && user.jiraBaseUrl && user.storyPointsFieldId) {
        const decrypted = await kmsClient.send(new DecryptCommand({
          CiphertextBlob: Buffer.from(user.jiraToken, "base64")
        }));
        const jiraToken = new TextDecoder().decode(decrypted.Plaintext);

        const credentials = Buffer.from(`${user.jiraEmail}:${jiraToken}`).toString("base64");
        await axios.put(
          `${user.jiraBaseUrl}/rest/api/3/issue/${story.issueKey}`,
          {
            fields: {
              [user.storyPointsFieldId]: parseInt(storyEstimationRounded)
            }
          },
          {
            headers: {
              "Authorization": `Basic ${credentials}`,
              "Content-Type": "application/json",
              "Accept": "application/json"
            }
          }
        );

        console.log(`Updated Jira issue ${story.issueKey} with ${storyEstimationRounded} story points`);
      }
    }

    const connectionsResult = await docClient.send(new QueryCommand({
      TableName: WS_CONNECTIONS_TABLE,
      IndexName: WS_CONNECTIONS_TABLE_INDEX,
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: {
        ":roomId": revealRequest.roomId
      }
    }));
    const connections = connectionsResult.Items?.map(c => c.connectionId) ?? [];

    await Promise.allSettled(
      connections.map(connectionId => sendToConnection(connectionId, client, {
        action: "votesRevealed",
        storyId: revealRequest.storyId,
        votes: votes,
        storyEstimation: storyEstimation,
        storyEstimationRounded: storyEstimationRounded
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

function computeStoryEstimationValue(votes: VoteQueryResponse[]) {
  if (votes.length === 0) {
    return "0";
  }

  let sum = 0;
  let count = 0;

  for (const vote of votes) {
    if (vote.voteValue === "?") {
      continue;
    }

    const voteValue = parseInt(vote.voteValue);
    sum += voteValue;
    count++;
  }

  if (count === 0) {
    return "0";
  }

  return String(Math.round((sum / count) * 100) / 100);
}

function roundStoryEstimation(storyEstimation: string) {
  const storyEstimationFloat = parseFloat(storyEstimation);
  let closest = VALID_ESTIMATES[0];

  let minDiff = Math.abs(storyEstimationFloat - parseInt(closest));
  for (const estimate of VALID_ESTIMATES) {
    const diff = Math.abs(storyEstimationFloat - parseInt(estimate));
    if (diff < minDiff) {
      minDiff = diff;
      closest = estimate;
    }
  }

  return closest;
}
