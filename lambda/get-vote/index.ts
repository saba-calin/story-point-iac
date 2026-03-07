import {generateErrorResponse, VoteQueryResponse} from "../util";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, QueryCommand} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const VOTES_TABLE = process.env.VOTES_TABLE!;

export async function handler(event: any) {
  try {
    console.log(event);

    const storyId = event.pathParameters.storyId;
    if (!storyId) {
      return generateErrorResponse(400, "No story id provided");
    }

    const votesResult = await docClient.send(new QueryCommand({
      TableName: VOTES_TABLE,
      KeyConditionExpression: "storyId = :storyId",
      ExpressionAttributeValues: {
        ":storyId": storyId
      }
    }));
    const votes = votesResult.Items as VoteQueryResponse[] || [];

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
