import {generateErrorResponse, UserContext} from "../util";

export async function handler(event: any) {
  try {
    const userContext = event.requestContext.authorizer.lambda as UserContext;
    console.log("User Context: ", userContext);

    return {
      statusCode: 200,
      body: JSON.stringify(userContext),
      headers: {
        "Content-Type": "application/json"
      }
    };

  } catch (error: any) {
    console.error(error);
    return generateErrorResponse(500, 'Internal server error');
  }
}
