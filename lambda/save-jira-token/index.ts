import {generateErrorResponse, UserContext} from "../util";
import {SaveTokenRequest} from "./util/SaveTokenRequest";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {KMSClient, EncryptCommand} from "@aws-sdk/client-kms";
import {DynamoDBDocumentClient, UpdateCommand} from "@aws-sdk/lib-dynamodb";
import axios from "axios";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const kmsClient = new KMSClient({});

const USERS_TABLE = process.env.USERS_TABLE!;
const KMS_KEY_ID = process.env.KMS_KEY_ID!;

export async function handler(event: any) {
  try {
    const userContext = event.requestContext.authorizer.lambda as UserContext;
    console.log(`Saving jira key for user with username ${userContext.username}`);

    const saveTokenRequest = JSON.parse(event.body) as SaveTokenRequest;
    if (!saveTokenRequest.jiraBaseUrl || !saveTokenRequest.jiraEmail || !saveTokenRequest.jiraToken) {
      return generateErrorResponse(400, "Invalid request");
    }

    const credentials = Buffer.from(`${saveTokenRequest.jiraEmail}:${saveTokenRequest.jiraToken}`).toString("base64");
    const fieldsResponse = await axios.get(`${saveTokenRequest.jiraBaseUrl}/rest/api/3/field`, {
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Accept": "application/json"
      }
    });
    const storyPointsField = fieldsResponse.data.find((field: any) => field.name === "Story Points");
    const storyPointsFieldId = storyPointsField.id;

    const encrypted = await kmsClient.send(new EncryptCommand({
      KeyId: KMS_KEY_ID,
      Plaintext: Buffer.from(saveTokenRequest.jiraToken)
    }));
    const encryptedToken = Buffer.from(encrypted.CiphertextBlob!).toString("base64");

    await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: {
        username: userContext.username
      },
      UpdateExpression: "SET jiraToken = :jiraToken, jiraBaseUrl = :jiraBaseUrl, jiraEmail = :jiraEmail, storyPointsFieldId = :storyPointsFieldId",
      ExpressionAttributeValues: {
        ":jiraToken": encryptedToken,
        ":jiraBaseUrl": saveTokenRequest.jiraBaseUrl,
        ":jiraEmail": saveTokenRequest.jiraEmail,
        ":storyPointsFieldId": storyPointsFieldId
      }
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Jira token saved successfully"
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
