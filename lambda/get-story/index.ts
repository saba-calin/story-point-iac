import {generateErrorResponse, StoryQueryResponse} from "../util";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, QueryCommand} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const STORIES_TABLE = process.env.STORIES_TABLE!;

export async function handler(event: any) {
  try {
    console.log(event);

    const roomId = event.pathParameters.roomId;
    if (!roomId) {
      return generateErrorResponse(400, "No room id provided");
    }

    const storiesResult = await docClient.send(new QueryCommand({
      TableName: STORIES_TABLE,
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: {
        ":roomId": roomId
      }
    }));
    const stories = storiesResult.Items as StoryQueryResponse[] || [];

    return {
      statusCode: 200,
      body: JSON.stringify({
        stories: stories
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
