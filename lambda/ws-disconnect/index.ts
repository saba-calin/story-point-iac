import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DeleteCommand, DynamoDBDocumentClient, GetCommand, QueryCommand} from "@aws-sdk/lib-dynamodb";
import {ConnectionQueryResponse, ok, sendToConnection, UserContext} from "../util";
import {ApiGatewayManagementApiClient} from "@aws-sdk/client-apigatewaymanagementapi";
import {NodeHttpHandler} from "@smithy/node-http-handler";
import {Agent} from "https";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const WS_CONNECTIONS_TABLE = process.env.WS_CONNECTIONS_TABLE!;
const WS_CONNECTIONS_TABLE_INDEX = process.env.WS_CONNECTIONS_TABLE_INDEX!;

const httpsAgent = new Agent({keepAlive: true, maxSockets: Infinity});
let apiGwClient: ApiGatewayManagementApiClient;

export async function handler(event: any) {
  try {
    // console.log(event);
    const {connectionId, domainName} = event.requestContext;

    if (!apiGwClient) {
      apiGwClient = new ApiGatewayManagementApiClient({
        endpoint: `https://${domainName}`,
        requestHandler: new NodeHttpHandler({httpsAgent})
      });
    }
    const client = apiGwClient;

    const connectionResult = await docClient.send(new GetCommand({
      TableName: WS_CONNECTIONS_TABLE,
      Key: {
        connectionId: connectionId
      }
    }));
    const connection = connectionResult.Item as ConnectionQueryResponse;

    if (!connection) {
      console.log(`Connection ${connectionId} not found in database`);
      return ok();
    }

    const roomId = connection.roomId;
    const username = connection.username;

    await docClient.send(new DeleteCommand({
      TableName: WS_CONNECTIONS_TABLE,
      Key: {
        connectionId: connectionId
      }
    }));

    const connectionsResult = await docClient.send(new QueryCommand({
      TableName: WS_CONNECTIONS_TABLE,
      IndexName: WS_CONNECTIONS_TABLE_INDEX,
      KeyConditionExpression: "roomId = :roomId",
      ExpressionAttributeValues: {
        ":roomId": roomId
      }
    }));
    const connections = connectionsResult.Items as ConnectionQueryResponse[] ?? [];

    await Promise.allSettled(
      connections.map(connection => sendToConnection(connection.connectionId, client, {
        action: "playerLeft",
        player: username
      }))
    );

    return ok();

  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500
    }
  }
}
