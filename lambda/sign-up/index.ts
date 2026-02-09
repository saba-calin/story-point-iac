import {SignUpRequest} from "./util/SignUpRequest";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import generateErrorResponse from "../util";
import * as bcrypt from "bcryptjs";
// import * as jwt from "jsonwebtoken";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export async function handler(event: any) {
  try {
    const signUpRequest: SignUpRequest = JSON.parse(event.body);
    console.log(signUpRequest);

    if (!signUpRequest.firstName || !signUpRequest.lastName || !signUpRequest.username || !signUpRequest.email || !signUpRequest.password) {
      return generateErrorResponse(400, 'Missing required fields');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(signUpRequest.email)) {
      return generateErrorResponse(400, 'Invalid email format');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "OK"
      })
    };
  } catch (error) {

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Internal server error"
      })
    }
  }
}
