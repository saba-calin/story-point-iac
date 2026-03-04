import {generateErrorResponse, getSecret, RoomQueryResponse, RoomStatus} from "../util";
import {AiEstimateRequest} from "./util/AiEstimateRequest";
import {SecretsManagerClient} from "@aws-sdk/client-secrets-manager";
import {OpenAI} from "openai";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, GetCommand, QueryCommand} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const secretsClient = new SecretsManagerClient({});

const ROOMS_TABLE = process.env.ROOMS_TABLE!;
const STORIES_TABLE = process.env.STORIES_TABLE!;
const OPEN_AI_SECRET_KEY_ARN = process.env.OPEN_AI_SECRET_KEY_ARN!;

let cachedOpenAiKeySecret: string | null = null;

export async function handler(event: any) {
  try {
    console.log(event);

    const aiEstimateRequest = JSON.parse(event.body) as AiEstimateRequest;
    if (!aiEstimateRequest.storyName) {
      return generateErrorResponse(400, "The story must have at least a name");
    }

    cachedOpenAiKeySecret = await getSecret(cachedOpenAiKeySecret, OPEN_AI_SECRET_KEY_ARN, secretsClient);
    const openAi = new OpenAI({ apiKey: cachedOpenAiKeySecret });

    const completion = await openAi.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: `You are an agile expert in story estimation. Estimate the following story using Fibonacci story points
                    "1", "2", "3", "5", "8", "13", "21" or "?" if the story name and description make no sense.
                    Respond ONLY with a JSON object in this format: { "estimate": <string> }.
                    
                    Name: ${aiEstimateRequest.storyName},
                    Description: ${aiEstimateRequest.storyDescription}`
        }
      ],
      response_format: {
        type: "json_object"
      }
    });

    const result = JSON.parse(completion.choices[0].message.content || "{ \"estimate\": \"?\" }");

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: {
        "Content-Type": "application/json"
      }
    };

  } catch (error: any) {
    console.error(error);
    return generateErrorResponse(500, "Internal server error");
  }
}
