import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

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
