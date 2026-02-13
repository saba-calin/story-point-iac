#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import {HostedZoneStack} from "../lib/hosted-zone-stack";
import {FrontendStack} from "../lib/frontend-stack";
import * as fs from 'fs';
import * as path from 'path';
import {Constants} from "../constants/constants";
import {DynamoStack} from "../lib/dynamo-stack";
import {LambdaStack} from "../lib/lambda-stack";
import {ApiGatewayStack} from "../lib/api-gateway-stack";
import {SecretsStack} from "../lib/secrets-stack";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
};
const constantsFile = JSON.parse(fs.readFileSync(path.join(__dirname, '../constants/constants.json'), 'utf-8'));
const constants = new Constants(constantsFile);

const hostedZoneStack = new HostedZoneStack(app, 'HostedZoneStack', constants, {
  env: env,
  description: 'Stack used to create the hosted zone, acm certificates and custom domain names for API Gateway'
});

new SecretsStack(app, 'SecretsStack', constants, {
  env: env,
  description: 'Stack used to create the secret keys use by the the application'
});

new FrontendStack(app, 'FrontendStack', constants, {
  env: env,
  description: 'Stack used to create the buckets and cloudfront distributions for the frontend'
});

const dynamoStack = new DynamoStack(app, 'DynamoStack', constants, {
  env: env,
  description: 'Stack used to create the DynamoDB tables'
});

new LambdaStack(app, 'LambdaStack', constants,
  dynamoStack.usersTable,
  dynamoStack.userEmailsTable,
  dynamoStack.roomsTable,
  {
    env: env,
    description: 'Stack used to create all Lambda functions'
  }
);

new ApiGatewayStack(app, 'ApiGatewayStack', constants, hostedZoneStack.customDomainName, {
  env: env,
  description: 'Stack used to create the API Gateway'
});
