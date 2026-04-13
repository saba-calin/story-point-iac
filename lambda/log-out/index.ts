import {generateErrorResponse, getCookieValue, UserContext} from "../util";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DeleteCommand, DynamoDBDocumentClient} from "@aws-sdk/lib-dynamodb";
import {createHash} from "node:crypto";

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const REFRESH_TOKENS_TABLE = process.env.REFRESH_TOKENS_TABLE!;
const ROOT_DOMAIN = process.env.ROOT_DOMAIN!;

export async function handler(event: any) {
  try {
    console.log(event);

    const cookies = event.cookies?.join(";") || "";
    const refreshToken = getCookieValue(cookies, "sp-refresh");

    if (refreshToken) {
      const refreshTokenHash = createHash("sha256").update(refreshToken).digest("hex");
      await docClient.send(new DeleteCommand({
        TableName: REFRESH_TOKENS_TABLE,
        Key: {refreshTokenHash}
      }));
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Logged out successfully"
      }),
      headers: {
        "Content-Type": "application/json"
      },
      cookies: [
        `sp-access=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0; Domain=.${ROOT_DOMAIN}`,
        `sp-refresh=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0; Domain=.${ROOT_DOMAIN}`
        // `sp-access=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Domain=.${ROOT_DOMAIN}`,
        // `sp-refresh=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Domain=.${ROOT_DOMAIN}`
      ]
    };

  } catch (error: any) {
    console.log(error);
    return generateErrorResponse(500, "Internal server error");
  }
}