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
  profilePictureKey: string;
  jiraToken: string;
  jiraBaseUrl: string;
  jiraEmail: string;
  storyPointsFieldId: string;
}

export const VALID_VOTES = ["1", "2", "3", "5", "8", "13", "21", "?"];
export const VALID_ESTIMATES = ["1", "2", "3", "5", "8", "13", "21"];

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

export interface RefreshTokenQueryResponse {
  refreshTokenHash: string;
  username: string;
  createdAt: number;
  expiresAt: number;
  ttl: number;
}

export interface StoryQueryResponse {
  roomId: string;
  storyId: string;
  name: string;
  description: string;
  status: StoryStatus;
  storyEstimation: number;
  issueKey: string;
}

export interface VoteQueryResponse {
  storyId: string,
  username: string,
  voteValue: string
}

export interface ConnectionQueryResponse {
  connectionId: string,
  joinedAt: number,
  roomId: string,
  username: string,
  profilePictureKey: string
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

export async function getSecret(
  cachedSecret: string | null,
  secretArn: string,
  secretsClient: SecretsManagerClient
): Promise<string> {

  if (cachedSecret) {
    console.log("using cached secret");
    return cachedSecret;
  }

  console.log("fetching secret...");

  const res = await secretsClient.send(
    new GetSecretValueCommand({SecretId: secretArn})
  );

  const parsedSecret = JSON.parse(res.SecretString!);
  return parsedSecret.secret;
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

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpg": ".jpg",
  "image/jpeg": ".jpeg",
  "image/png": ".png"
};

export const extractIssueDescription = (description: any): string | null => {
  if (!description?.content) {
    return null;
  }

  return description.content
    .flatMap((block: any) => block.content ?? [])
    .map((inline: any) => inline.text ?? "")
    .join(" ") || null;
};
