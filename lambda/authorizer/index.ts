import {getCookieValue, getJwtSecret} from "../util";
import {SecretsManagerClient} from "@aws-sdk/client-secrets-manager";
import * as jwt from "jsonwebtoken";
import {UserContext} from "./util/UserContext";

const secretsClient = new SecretsManagerClient({});

const JWT_SECRET_ARN = process.env.JWT_SECRET_ARN!;

let cachedJwtSecret: string | null = null;

export async function handler(event: any, context: any, callback: any) {
  try {
    console.log("Event: ", event);
    const cookieHeader = event.headers.cookie;

    const token = getCookieValue(cookieHeader, "jwt");
    if (!token) {
      console.warn("No JWT Cookie provided");
      callback("Unauthorized", null);
      return;
    }

    cachedJwtSecret = await getJwtSecret(cachedJwtSecret, JWT_SECRET_ARN, secretsClient);

    let payload: UserContext;
    try {
      payload = jwt.verify(token, cachedJwtSecret) as UserContext;
    } catch (error: any) {
      if (error.name === "TokenExpiredError") {
        console.warn("JWT token expired");
      } else {
        console.warn("JWT token invalid: ", error.message);
      }

      callback("Unauthorized", null);
      return;
    }

    return {
      isAuthorized: true,
      context: {
        username: payload.username,
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName
      }
    };

  } catch (error: any) {
    console.error("Authorization error: ", error);

    callback("Unauthorized", null);
    return;
  }
}
