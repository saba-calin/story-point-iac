import {generateErrorResponse, StoryQueryResponse, VoteQueryResponse} from "../util";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, GetCommand, QueryCommand} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const STORIES_TABLE = process.env.STORIES_TABLE!;
const VOTES_TABLE = process.env.VOTES_TABLE!;

export async function handler(event: any) {
  try {
    console.log(event);

    const roomId = event.pathParameters.roomId;
    const storyId = event.pathParameters.storyId;
    if (!roomId) {
      return generateErrorResponse(400, "No room id provided");
    }
    if (!storyId) {
      return generateErrorResponse(400, "No story id provided");
    }

    const storyResult = await docClient.send(new GetCommand({
      TableName: STORIES_TABLE,
      Key: {
        roomId: roomId,
        storyId: storyId
      }
    }));
    const story = storyResult.Item as StoryQueryResponse;

    let votes: VoteQueryResponse[] = [];
    if (story.storyEstimation) {
      const votesResult = await docClient.send(new QueryCommand({
        TableName: VOTES_TABLE,
        KeyConditionExpression: "storyId = :storyId",
        ExpressionAttributeValues: {
          ":storyId": storyId
        }
      }));
      votes = votesResult.Items as VoteQueryResponse[] || [];
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        votes: votes
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
