import {generateErrorResponse, UserContext, UserQueryResponse} from "../util";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, GetCommand} from "@aws-sdk/lib-dynamodb";
import {DecryptCommand, KMSClient} from "@aws-sdk/client-kms";
import axios from "axios";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const kmsClient = new KMSClient({});

const USERS_TABLE = process.env.USERS_TABLE!;

export async function handler(event: any) {
  try {
    console.log(event);
    const userContext = event.requestContext.authorizer.lambda as UserContext;

    const userResponse = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: {
        username: userContext.username
      }
    }));
    const user = userResponse.Item as UserQueryResponse;

    if (!user.jiraToken) {
      return generateErrorResponse(404, "No Jira token found");
    }
    if (!user.jiraEmail) {
      return generateErrorResponse(404, "No Jira email found");
    }
    if (!user.jiraBaseUrl) {
      return generateErrorResponse(404, "No Jira base url found");
    }
    if (!user.storyPointsFieldId) {
      return generateErrorResponse(404, "No story points field found");
    }

    const decrypted = await kmsClient.send(new DecryptCommand({
      CiphertextBlob: Buffer.from(user.jiraToken, "base64")
    }));
    const jiraToken = new TextDecoder().decode(decrypted.Plaintext);

    const credentials = Buffer.from(`${user.jiraEmail}:${jiraToken}`).toString("base64");
    const projectsResponse = await axios.get(`${user.jiraBaseUrl}/rest/api/3/project`, {
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Accept": "application/json"
      }
    });
    const projects = projectsResponse.data.map((project: any) => project.key);

    return {
      statusCode: 200,
      body: JSON.stringify({
        projects: projects
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
