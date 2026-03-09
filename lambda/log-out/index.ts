import {generateErrorResponse, UserContext} from "../util";

const ROOT_DOMAIN = process.env.ROOT_DOMAIN!;

export async function handler(event: any) {
  try {
    const userContext = event.requestContext.authorizer.lambda as UserContext;
    console.log(`User ${userContext.username} is logging out`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Logged out successfully"
      }),
      headers: {
        "Content-Type": "application/json"
      },
      cookies: [
        `jwt=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0; Domain=.${ROOT_DOMAIN}`
      ]
    };

  } catch (error: any) {
    console.log(error);
    return generateErrorResponse(500, "Internal server error");
  }
}