import {generateErrorResponse, UserContext, UserQueryResponse} from "../util";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, GetCommand} from "@aws-sdk/lib-dynamodb";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const USERS_TABLE = process.env.USERS_TABLE;

export async function handler(event: any) {
  try {
    const userContext = event.requestContext.authorizer.lambda as UserContext;
    console.log("User Context: ", userContext);

    const userResponse = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: {
        username: userContext.username
      }
    }));
    const user = userResponse.Item as UserQueryResponse;
    if (!user) {
      return generateErrorResponse(400, "User not found - this should never happen!");
    }

    const {password, jiraToken, jiraBaseUrl, jiraEmail, storyPointsFieldId, ...userWithoutSensibleInformation} = user;
    return {
      statusCode: 200,
      body: JSON.stringify({
        ...userWithoutSensibleInformation,
        hasJiraAccess: !!jiraToken && !!jiraBaseUrl && !!jiraEmail && !!storyPointsFieldId
      }),
      headers: {
        "Content-Type": "application/json"
      }
    };

  } catch (error: any) {
    console.error(error);
    return generateErrorResponse(500, 'Internal server error');
  }
}
