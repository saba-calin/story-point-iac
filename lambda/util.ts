import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand
} from "@aws-sdk/client-apigatewaymanagementapi";

export interface UserContext {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface UserQueryResponse {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

export enum StoryStatus {
  ACTIVE = "ACTIVE",
  NON_ACTIVE = "NON_ACTIVE"
}

export enum RoomStatus {
  OPEN = "OPEN",
  CLOSED = "CLOSED"
}

export interface RoomQueryResponse {
  roomId: string,
  name: string,
  ownerUsername: string,
  createdAt: Date,
  status: RoomStatus
}

export interface StoryQueryResponse {
  roomId: string;
  storyId: string;
  name: string;
  description: string;
  status: StoryStatus;
}

export function generateErrorResponse(statusCode: number, message: string) {
  return {
    statusCode: statusCode,
    body: JSON.stringify({
      message: message
    }),
    headers: {
      "Content-Type": "application/json"
    }
  };
}

export function getCookieValue(cookieHeader: string, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const [key, ...rest] = cookie.trim().split("=");
    if (key === name) {
      return rest.join("=");
    }
  }

  return null;
}

export async function getJwtSecret(
  cachedJwtSecret: string | null,
  jwtSecretArn: string,
  secretsClient: SecretsManagerClient
): Promise<string> {

  if (cachedJwtSecret) {
    return cachedJwtSecret;
  }

  const res = await secretsClient.send(
    new GetSecretValueCommand({SecretId: jwtSecretArn})
  );

  cachedJwtSecret = res.SecretString!;
  return cachedJwtSecret;
}

export async function sendErrorMessageToConnection(connectionId: string, message: string, client: ApiGatewayManagementApiClient) {
  await client.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: JSON.stringify({
      action: "error",
      message: message
    })
  }));
}

export async function closeConnection(connectionId: string, client: ApiGatewayManagementApiClient) {
  await client.send(new DeleteConnectionCommand({
    ConnectionId: connectionId
  }));
}

export async function sendToConnection(connectionId: string, client: ApiGatewayManagementApiClient, data: object) {
  await client.send(new PostToConnectionCommand({
    ConnectionId: connectionId,
    Data: JSON.stringify(data)
  }));
}

export function ok() {
  return {
    statusCode: 200
  };
}
