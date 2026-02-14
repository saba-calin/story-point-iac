import {generateErrorResponse} from "../util";

export async function handler(event: any) {
  try {
    console.log("Event: ", event);

    return {
      statusCode: 200
    };

  } catch (error: any) {
    console.error(error);
    return generateErrorResponse(500, "Internal server error");
  }
}