import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

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

export enum RoomStatus {
  OPEN = "OPEN",
  CLOSED = "CLOSED"
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
