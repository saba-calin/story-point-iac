import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";

export async function handler(event: any) {
  try {
    console.log("Event: ", event);

    const {connectionId, domainName, stage} = event.requestContext;

    const client = new ApiGatewayManagementApiClient({
      endpoint: `https://${domainName}`
    });

    const message = {
      type: "response",
      data: "Message received!"
    }

    console.log("Sending message: ", domainName, stage, message, connectionId);
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify(message)
      })
    );

    return {
      statusCode: 200
    };

  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500
    }
  }
}
